import argparse
import json
import logging
import os
import shutil
import urllib.parse
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.renderer import render_short

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tmc-action")
MAX_UPLOAD_BYTES = 45_000_000


def storage_request(method: str, path: str, body: bytes | None = None, content_type: str | None = None):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    bucket = os.environ.get("SUPABASE_BUCKET", "tmc-videos")
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    encoded = urllib.parse.quote(path, safe="/")
    if method == "DELETE":
        url = f"{base}/storage/v1/object/{bucket}"
    else:
        url = f"{base}/storage/v1/object/{bucket}/{encoded}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    if method == "POST":
        headers["x-upsert"] = "true"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    return urllib.request.urlopen(request, timeout=180)


def download_source(object_key: str, destination: Path) -> None:
    with storage_request("GET", object_key) as response:
        length = int(response.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            raise ValueError("The uploaded video is empty or exceeds the 45 MB free-plan limit.")
        with destination.open("wb") as output:
            shutil.copyfileobj(response, output)


def upload_output(object_key: str, source: Path) -> None:
    if source.stat().st_size > MAX_UPLOAD_BYTES:
        raise ValueError("The rendered Short exceeds the 45 MB free storage limit.")
    storage_request("POST", object_key, source.read_bytes(), "video/mp4").close()


def delete_source(object_key: str) -> None:
    body = json.dumps({"prefixes": [object_key]}).encode("utf-8")
    storage_request("DELETE", "", body, "application/json").close()


def update_status(job_id: str, status: str, progress: int, message: str, output_key: str | None = None) -> None:
    payload = {"status": status, "progress": progress, "message": message}
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
    with urllib.request.urlopen(request, timeout=30) as response:
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
            download_source(args.object_key, source)
            update_status(args.job_id, "rendering", 35, "Selecting scenes, creating narration and rendering your Short.")
            result = render_short(source, output)
            output_key = f"outputs/{args.job_id}.mp4"
            upload_output(output_key, output)
            delete_source(args.object_key)
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
