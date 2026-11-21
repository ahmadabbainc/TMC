import asyncio
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

import edge_tts
from google import genai

from app.core.config import get_settings


SCENE_PROMPT = """
You are the video editor for an automated YouTube Shorts factory.
Watch the uploaded source video and return ONLY valid JSON with this shape:
{
  "title": "short engaging title",
  "clips": [{"start": 0.0, "end": 8.0}],
  "voiceover": "A compelling, original narration..."
}
Select 5 to 9 visually interesting moments in chronological order.
The combined selected footage must total between 50 and 60 seconds.
Use precise timestamps from the source video. Do not invent events.
Write an engaging, factual voiceover that fits approximately 50-58 seconds.
Do not include markdown fences or any text outside the JSON object.
"""


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def _probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True, capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def _parse_edit_plan(raw: str, source_duration: float) -> dict:
    cleaned = re.sub(r"^\s*```(?:json)?|\```\s*$", "", raw.strip(), flags=re.MULTILINE)
    plan = json.loads(cleaned)
    clips = plan.get("clips")
    voiceover = plan.get("voiceover")
    if not isinstance(clips, list) or not 3 <= len(clips) <= 12:
        raise ValueError("The AI returned an invalid clip list.")
    if not isinstance(voiceover, str) or len(voiceover.strip()) < 80:
        raise ValueError("The AI returned an incomplete narration.")
    normalized = []
    total = 0.0
    for clip in clips:
        start = float(clip["start"])
        end = float(clip["end"])
        if start < 0 or end > source_duration or end <= start:
            raise ValueError("The AI selected a timestamp outside the source video.")
        if end - start < 1.5:
            continue
        normalized.append({"start": start, "end": end})
        total += end - start
    if len(normalized) < 3 or total < 45:
        raise ValueError("The AI-selected footage is too short to create a Short.")
    return {
        "title": str(plan.get("title") or "Your new Short")[:100],
        "clips": normalized,
        "voiceover": voiceover.strip(),
    }


def _make_captions(text: str, duration: float, destination: Path) -> None:
    words = text.split()
    chunks = [" ".join(words[index:index + 7]) for index in range(0, len(words), 7)]
    weights = [max(1, len(chunk)) for chunk in chunks]
    total_weight = sum(weights)
    cursor = 0.0
    lines = []
    for index, (chunk, weight) in enumerate(zip(chunks, weights), start=1):
        span = duration * weight / total_weight
        start = cursor
        end = min(duration, cursor + span)
        cursor = end
        def stamp(seconds: float) -> str:
            millis = int(seconds * 1000)
            hours, millis = divmod(millis, 3_600_000)
            minutes, millis = divmod(millis, 60_000)
            secs, millis = divmod(millis, 1000)
            return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"
        lines.extend([str(index), f"{stamp(start)} --> {stamp(end)}", chunk, ""])
    destination.write_text("\n".join(lines), encoding="utf-8")


async def _synthesize_voice(text: str, destination: Path) -> None:
    settings = get_settings()
    communicate = edge_tts.Communicate(
        text,
        settings.tts_voice,
        rate=settings.tts_rate,
    )
    await communicate.save(str(destination))


def _select_scenes(source: Path, source_duration: float) -> dict:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    client = genai.Client(api_key=settings.gemini_api_key)
    uploaded = client.files.upload(file=str(source))
    try:
        while str(uploaded.state).upper().endswith("PROCESSING"):
            import time
            time.sleep(2)
            uploaded = client.files.get(name=uploaded.name)
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[uploaded, f"{SCENE_PROMPT}\nSource duration: {source_duration:.2f} seconds."],
        )
        return _parse_edit_plan(response.text or "", source_duration)
    finally:
        try:
            client.files.delete(name=uploaded.name)
        except Exception:
            pass


async def render_short(source: Path, output: Path) -> dict[str, str]:
    source_duration = await asyncio.to_thread(_probe_duration, source)
    if source_duration < 50:
        raise ValueError("Please upload a source video at least 50 seconds long.")

    plan = await asyncio.to_thread(_select_scenes, source, source_duration)
    with tempfile.TemporaryDirectory(prefix="tmc-render-") as temp:
        work = Path(temp)
        clip_paths = []
        for index, clip in enumerate(plan["clips"]):
            clip_path = work / f"clip-{index:02}.mp4"
            _run([
                "ffmpeg", "-y", "-ss", str(clip["start"]),
                "-i", str(source), "-t", str(clip["end"] - clip["start"]),
                "-vf",
                "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
                "-an", "-c:v", "libx264", "-preset", "veryfast",
                "-crf", "23", "-pix_fmt", "yuv420p", str(clip_path),
            ])
            clip_paths.append(clip_path)

        concat_file = work / "clips.txt"
        concat_file.write_text(
            "".join(f"file '{path.as_posix()}'\n" for path in clip_paths),
            encoding="utf-8",
        )
        silent_video = work / "silent.mp4"
        _run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p", str(silent_video),
        ])

        voice_path = work / "voice.mp3"
        await _synthesize_voice(plan["voiceover"], voice_path)
        voice_duration = await asyncio.to_thread(_probe_duration, voice_path)
        if voice_duration > 60:
            raise ValueError("The generated narration is longer than 60 seconds.")

        captions = work / "captions.srt"
        _make_captions(plan["voiceover"], voice_duration, captions)
        output.parent.mkdir(parents=True, exist_ok=True)
        _run([
            "ffmpeg", "-y", "-i", str(silent_video), "-i", str(voice_path),
            "-vf", f"subtitles={captions}:force_style='FontName=DejaVu Sans,FontSize=18,Outline=2,Shadow=1,MarginV=130'",
            "-map", "0:v:0", "-map", "1:a:0", "-t", "60",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", "-shortest", str(output),
        ])
    return {"title": plan["title"], "duration_seconds": str(min(60, _probe_duration(output)))}
