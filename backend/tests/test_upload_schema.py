import pytest
from pydantic import ValidationError

from app.schemas.uploads import UploadRequest


def test_accepts_supported_mp4_upload():
    payload = UploadRequest(
        file_name="source-video.mp4",
        content_type="video/mp4",
        size_bytes=1024,
    )
    assert payload.file_name == "source-video.mp4"
    assert payload.content_type == "video/mp4"


@pytest.mark.parametrize(
    ("file_name", "content_type"),
    [
        ("source.exe", "video/mp4"),
        ("source.mp4", "application/octet-stream"),
        ("../source.mp4", "video/mp4"),
        ("folder/source.mp4", "video/mp4"),
    ],
)
def test_rejects_unsupported_or_unsafe_upload(file_name, content_type):
    with pytest.raises(ValidationError):
        UploadRequest(
            file_name=file_name,
            content_type=content_type,
            size_bytes=1024,
        )


def test_rejects_empty_or_negative_file_size():
    with pytest.raises(ValidationError):
        UploadRequest(
            file_name="source.mp4",
            content_type="video/mp4",
            size_bytes=0,
        )
