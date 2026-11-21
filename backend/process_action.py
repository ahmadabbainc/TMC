import argparse
import json
import logging
import os
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.renderer import render_short
from app.services.storage import download_object, upload_object

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tmc-action")


def update_status(job_id: str, status: str, progress: int, message: str, output_key: str | None = None) -> None:
    payload = {
        "status": status,
        "progress": progress,
        "message": message,
    }
    if output_key:
        payload["output_key"] = output_key
    request = urllib.request.Request(
        f"{os.environ['TMC_STATUS_CALLBACK_URL'].rstrip('/')}/api/jobs/{job_id}/status",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ['TMC_CALLBACK_SECRET']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status >= 300:
            raise RuntimeError(f"Could not update job status: HTTP {response.status}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--object-key", required=True)
    parser.add_argument("--file-name", required=True)
    args = parser.parse_args()

    try:
        update_status(args.job_id, "analyzing", 10, "AI is analyzing your video.")
        with TemporaryDirectory(prefix="tmc-action-") as folder:
            work = Path(folder)
            source = work / "source-video"
            output = work / "short.mp4"
            download_object(args.object_key, source)
            update_status(args.job_id, "rendering", 35, "Selecting scenes, creating narration and rendering your Short.")
            result = render_short(source, output)
            output_key = f"outputs/{args.job_id}.mp4"
            upload_object(output_key, output)
            update_status(args.job_id, "completed", 100, "Your Short is ready.", output_key)
            logger.info("Completed TMC job %s: %s", args.job_id, result.get("title"))
    except Exception as error:
        logger.exception("TMC job %s failed", args.job_id)
        try:
            update_status(args.job_id, "failed", 0, str(error)[:500])
        except Exception:
            logger.exception("Could not report failure for job %s", args.job_id)
        raise


if __name__ == "__main__":
    main()
