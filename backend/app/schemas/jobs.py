from enum import StrEnum
from pydantic import BaseModel, Field


class JobStatus(StrEnum):
    queued = "queued"
    analyzing = "analyzing"
    writing = "writing"
    rendering = "rendering"
    completed = "completed"
    failed = "failed"


class JobCreateResponse(BaseModel):
    id: str = Field(description="Stable identifier for the processing job")
    status: JobStatus = JobStatus.queued
    message: str = "Your video has been accepted for processing."


class JobStatusResponse(BaseModel):
    id: str
    status: JobStatus
    progress: int = Field(default=0, ge=0, le=100)
    message: str | None = None
    output_url: str | None = None
