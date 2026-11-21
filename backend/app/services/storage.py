from functools import lru_cache
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.config import Config

from app.core.config import get_settings


@lru_cache
def _client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.storage_endpoint or None,
        region_name=settings.storage_region,
        aws_access_key_id=settings.storage_access_key or None,
        aws_secret_access_key=settings.storage_secret_key or None,
        config=Config(signature_version="s3v4"),
    )


def create_video_upload(file_name: str, content_type: str) -> dict[str, object]:
    settings = get_settings()
    if not settings.storage_bucket:
        raise RuntimeError("Object storage is not configured.")

    extension = file_name.rsplit(".", 1)[-1].lower()
    object_key = f"uploads/{uuid4().hex}.{extension}"
    upload_url = _client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.storage_bucket,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=settings.upload_url_ttl_seconds,
    )
    return {
        "upload_url": upload_url,
        "upload_headers": {"Content-Type": content_type},
        "upload_method": "PUT",
        "object_key": object_key,
        "expires_in": settings.upload_url_ttl_seconds,
        "max_upload_bytes": settings.max_upload_bytes,
    }


def download_object(object_key: str, destination: Path) -> None:
    settings = get_settings()
    if not settings.storage_bucket:
        raise RuntimeError("Object storage is not configured.")

    metadata = _client().head_object(Bucket=settings.storage_bucket, Key=object_key)
    actual_size = int(metadata.get("ContentLength", 0))
    if actual_size <= 0 or actual_size > settings.max_upload_bytes:
        raise ValueError("Uploaded video is empty or exceeds the configured upload limit.")

    _client().download_file(settings.storage_bucket, object_key, str(destination))


def upload_object(object_key: str, source: Path) -> None:
    settings = get_settings()
    if not settings.storage_bucket:
        raise RuntimeError("Object storage is not configured.")
    _client().upload_file(
        str(source),
        settings.storage_bucket,
        object_key,
        ExtraArgs={"ContentType": "video/mp4"},
    )


def create_download_url(object_key: str) -> str:
    settings = get_settings()
    if not settings.storage_bucket:
        raise RuntimeError("Object storage is not configured.")
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.storage_bucket, "Key": object_key},
        ExpiresIn=settings.download_url_ttl_seconds,
    )
