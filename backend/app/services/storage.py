from functools import lru_cache
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
        aws_access_key_id=settings.storage_access_key,
        aws_secret_access_key=settings.storage_secret_key,
        config=Config(signature_version="s3v4"),
    )


def create_video_upload(file_name: str, content_type: str) -> dict[str, object]:
    settings = get_settings()
    if not settings.storage_bucket:
        raise RuntimeError("Object storage is not configured.")

    extension = file_name.rsplit(".", 1)[-1].lower()
    object_key = f"uploads/{uuid4().hex}.{extension}"
    response = _client().generate_presigned_post(
        Bucket=settings.storage_bucket,
        Key=object_key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, settings.max_upload_bytes],
        ],
        ExpiresIn=settings.upload_url_ttl_seconds,
    )
    return {
        "upload_url": response["url"],
        "fields": response["fields"],
        "object_key": object_key,
        "expires_in": settings.upload_url_ttl_seconds,
        "max_upload_bytes": settings.max_upload_bytes,
    }
