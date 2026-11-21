import asyncio
import json
import logging
import tempfile
from pathlib import Path

from app.core.config import get_settings
from app.services.queue import get_redis
from app.services.renderer import render_short
from app.services.storage import download_object, upload_object, create_download_url

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tmc-worker")


async def process_job(job_id: str) -> None:
    redis = get_redis()
    key = f"tmc:job:{job_id}"
    record = await redis.hgetall(key)
    if not record or not record.get("payload"):
        logger.warning("Skipping missing job %s", job_id)
        return

    payload = json.loads(record["payload"])
    await redis.hset(key, mapping={
        "status": "analyzing",
        "progress": "10",
        "message": "AI is analyzing your video.",
    })

    try:
        with tempfile.TemporaryDirectory(prefix="tmc-job-") as temp:
            work = Path(temp)
            source = work / "source-video"
            output = work / "short.mp4"

            await asyncio.to_thread(download_object, payload["object_key"], source)
            await redis.hset(key, mapping={
                "status": "rendering",
                "progress": "35",
                "message": "Selecting scenes, creating narration and rendering your Short.",
            })
            result = await render_short(source, output)

            output_key = f"outputs/{job_id}.mp4"
            await asyncio.to_thread(upload_object, output_key, output)
            download_url = await asyncio.to_thread(create_download_url, output_key)

            await redis.hset(key, mapping={
                "status": "completed",
                "progress": "100",
                "message": "Your Short is ready.",
                "output_url": download_url,
                "output_key": output_key,
                "title": result["title"],
                "duration_seconds": result["duration_seconds"],
            })
    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        await redis.hset(key, mapping={
            "status": "failed",
            "progress": "0",
            "message": str(exc)[:500],
        })


async def run_worker() -> None:
    redis = get_redis()
    logger.info("TMC worker listening for video jobs")
    while True:
        item = await redis.brpop("tmc:queue:video-jobs", timeout=0)
        if item:
            await process_job(item[1])


if __name__ == "__main__":
    asyncio.run(run_worker())
