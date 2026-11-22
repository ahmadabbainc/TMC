import argparse
import json
import logging
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.renderer import render_short

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tmc-action")
MAX_UPLOAD_BYTES = 45_000_000
HELPER = Path(__file__).with_name("blob_transfer.mjs")


def blob(command: str, pathname: str, local_path: str = "", payload: dict | None = None) -> None:
    args = ["node", str(HELPER), command, pathname, local_path]
    if payload is not None:
        args.append(json.dumps(payload))
    subprocess.run(args, check=True, env=os.environ.copy(), capture_output=True, text=True)


def update_status(job_id: str, status: str, progress: int, message: str, output_key: str | None = None) -> None:
    payload = {"id": job_id, "status": status, "progress": progress, "message": message}
    if output_key:
        payload["output_key"] = output_key
    blob("status", f"jobs/{job_id}.json", payload=payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--object-key", required=True)
    parser.add_argument("--file-name", required=True)
    args = parser.parse_args()

    try:
        update_status(args.job_id, "analyzing", 12, "AI is analyzing your video and finding the best scenes.")
        with TemporaryDirectory(prefix="tmc-action-") as folder:
            work = Path(folder)
            source = work / "source-video"
            output = work / "short.mp4"
            blob("download", args.object_key, str(source))
            if source.stat().st_size > MAX_UPLOAD_BYTES:
                raise ValueError("The uploaded video exceeds the 45 MB limit.")
            update_status(args.job_id, "rendering", 38, "Creating narration, voice-over and captions.")
            result = render_short(source, output)
            if output.stat().st_size > MAX_UPLOAD_BYTES:
                raise ValueError("The finished Short exceeds the 45 MB output limit.")
            output_key = f"outputs/{args.job_id}.mp4"
            blob("upload", output_key, str(output))
            blob("delete", args.object_key)
            update_status(args.job_id, "completed", 100, f"{result.get('title', 'Your Short')} is ready.", output_key)
            logger.info("Completed TMC job %s", args.job_id)
    except Exception as error:
        logger.exception("TMC job %s failed", args.job_id)
        try:
            update_status(args.job_id, "failed", 0, str(error)[:500])
        except Exception:
            logger.exception("Could not report failure for job %s", args.job_id)
        raise


if __name__ == "__main__":
    main()
