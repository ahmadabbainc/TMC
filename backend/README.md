# TMC API and worker

TMC keeps its API and long-running video worker separate from the Next.js frontend. Video files upload directly from the browser to S3-compatible object storage using a short-lived presigned **PUT** URL; the API never receives the video bytes.

## Implemented

- FastAPI health endpoint: `GET /health`.
- Bearer-token protection for internal API routes.
- S3-compatible presigned PUT uploads with a 2 GB application limit.
- Redis-backed job records and queue.
- Job status endpoint: `GET /v1/jobs/{job_id}`.
- Worker that downloads a source video, asks Gemini to select scenes and write narration, generates speech with Edge TTS, creates timed caption cards, renders a vertical MP4 with FFmpeg, and uploads the result.

## Required services and secrets

- Redis-compatible queue.
- S3-compatible object storage (Cloudflare R2 is supported).
- Gemini API key with access to the configured model.
- A long random `TMC_API_TOKEN` for the protected API routes.

Never place `TMC_API_TOKEN` in browser code. The frontend should call a server-side route that holds this secret. Before public launch, add user authentication and per-user authorization; the current token is an internal service credential, not end-user identity.

## Configure browser uploads

For Cloudflare R2, add a bucket CORS policy that permits your exact frontend origin and `PUT` requests. For example:

```json
[
  {
    "AllowedOrigins": ["https://your-tmc-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the example origin with the actual TMC frontend domain. Do not use a wildcard origin for a production app. R2 presigned URLs support PUT, not HTML form POST uploads.

The API validates the declared file size before issuing the URL, and the worker checks the actual stored object size again before downloading it. The presigned PUT itself does not enforce a browser form-style content-length range.

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
2. Upload the file bytes to the returned `upload_url` using the returned `upload_method` and `upload_headers`.
3. Call `POST /v1/jobs` with the returned `object_key` and file metadata.
4. Poll `GET /v1/jobs/{job_id}` until the worker completes or fails the job.

All API routes require `Authorization: Bearer <TMC_API_TOKEN>`.

## Video output

The worker currently creates a 1080×1920, 30 fps MP4, selects source scenes using Gemini, generates narration using Edge TTS, and burns captions into the output. The current caption timings are estimated from narration text rather than word-level speech alignment. The worker needs a reachable FFmpeg binary with libass subtitle support.
