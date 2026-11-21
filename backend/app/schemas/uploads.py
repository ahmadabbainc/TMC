from pydantic import BaseModel, Field, field_validator


ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
}
ALLOWED_EXTENSIONS = {"mp4", "mov", "webm", "mkv"}


class UploadRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=180)
    content_type: str
    size_bytes: int = Field(gt=0)

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, value: str) -> str:
        if value.lower() not in ALLOWED_VIDEO_TYPES:
            raise ValueError("Unsupported video format.")
        return value.lower()

    @field_validator("file_name")
    @classmethod
    def validate_file_name(cls, value: str) -> str:
        if "/" in value or "\\" in value or value.startswith("."):
            raise ValueError("Invalid file name.")
        extension = value.rsplit(".", 1)[-1].lower() if "." in value else ""
        if extension not in ALLOWED_EXTENSIONS:
            raise ValueError("Supported formats: MP4, MOV, WebM and MKV.")
        return value


class UploadResponse(BaseModel):
    upload_url: str
    fields: dict[str, str]
    object_key: str
    expires_in: int
    max_upload_bytes: int


class CreateJobRequest(BaseModel):
    object_key: str = Field(min_length=1, max_length=300)
    file_name: str = Field(min_length=1, max_length=180)
    duration_seconds: int | None = Field(default=None, ge=1, le=21600)
