import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.security import require_api_token
from app.schemas.jobs import JobCreateResponse, JobStatus, JobStatusResponse
from app.schemas.uploads import (
    CreateJobRequest,
    UploadRequest,
    UploadResponse,
)
from app.services.queue import enqueue_job, get_job
from app.services.storage import create_video_upload

router = APIRouter(prefix="/v1", dependencies=[Depends(require_api_token)])


@router.post("/uploads", response_model=UploadResponse, tags=["uploads"])
async def request_upload(payload: UploadRequest) -> UploadResponse:
    settings = get_settings()
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video exceeds the {settings.max_upload_bytes} byte upload limit.",
        )
    try:
        result = create_video_upload(payload.file_name, payload.content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return UploadResponse(**result)


@router.post("/jobs", response_model=JobCreateResponse, status_code=202, tags=["jobs"])
async def create_job(payload: CreateJobRequest) -> JobCreateResponse:
    if not payload.object_key.startswith("uploads/"):
        raise HTTPException(status_code=400, detail="Invalid upload reference.")

    job_id = uuid4().hex
    job = {
        "id": job_id,
        "object_key": payload.object_key,
        "file_name": payload.file_name,
        "duration_seconds": payload.duration_seconds,
        "target_duration_seconds": 60,
        "target_width": 1080,
        "target_height": 1920,
    }
    try:
        await enqueue_job(job)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return JobCreateResponse(id=job_id, status=JobStatus.queued)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse, tags=["jobs"])
async def read_job(job_id: str) -> JobStatusResponse:
    try:
        record = await get_job(job_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not record:
        raise HTTPException(status_code=404, detail="Job not found.")

    return JobStatusResponse(
        id=job_id,
        status=JobStatus(record["status"]),
        progress=int(record.get("progress", "0")),
        message=record.get("message"),
        output_url=record.get("output_url") or None,
    )
