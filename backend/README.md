# TMC API and worker

TMC keeps its API and long-running video worker separate from the Next.js frontend. Video files move directly between the browser and S3-compatible object storage; the API only issues short-lived upload forms and queues work.

## Implemented

- FastAPI health endpoint: `GET /health`.
- Bearer-token protection for internal API routes.
- S3-compatible presigned upload forms with a 2 GB default limit.
- Redis-backed job records and queue.
- Job status endpoint: `GET /v1/jobs/{job_id}`.
- Worker that downloads a source video, asks Gemini to select scenes and write narration, generates speech with Edge TTS, creates timed caption cards, renders a vertical MP4 with FFmpeg, and uploads the result.

## Required services and secrets

- Redis-compatible queue.
- S3-compatible object storage (Cloudflare R2 is supported).
- Gemini API key with access to the configured model.
- A long random `TMC_API_TOKEN` for the protected API routes.

Never place `TMC_API_TOKEN` in browser code. The frontend should call a server-side route that holds this secret. Before public launch, add user authentication and per-user authorization; the current token is an internal service credential, not end-user identity.

## Run locally

Install FFmpeg and fonts with subtitle rendering support, then:

```bash
cd backend
python -m venv .venv
# Activate the virtual environment, then:
pip install -r requirements.txt
cp .env.example .env
# Fill in the service credentials in .env.
uvicorn app.main:app --reload --port 8000
```

In a second terminal, from the same `backend` directory, run:

```bash
python -m app.worker
```

The API health check is at `http://localhost:8000/health`; interactive API docs are at `http://localhost:8000/docs`.

## Upload flow

1. Call `POST /v1/uploads` with `file_name`, `content_type` and `size_bytes`.
2. Submit the returned `fields` and file as multipart form data to the returned `upload_url`.
3. Call `POST /v1/jobs` with the returned `object_key` and file metadata.
4. Poll `GET /v1/jobs/{job_id}` until the worker completes or fails the job.

All API routes require `Authorization: Bearer <TMC_API_TOKEN>`.

## Video output

The worker currently creates a 1080×1920, 30 fps MP4, selects source scenes using Gemini, generates narration using Edge TTS, and burns captions into the output. The current caption timings are estimated from narration text rather than word-level speech alignment. The worker needs a reachable FFmpeg binary with libass subtitle support.
