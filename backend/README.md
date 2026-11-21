# TMC API

The API is a separate Python service. It is intentionally kept outside the Next.js app so video analysis and rendering can run in a worker without Vercel request time limits.

## Implemented

- FastAPI application and deployment health endpoint: `GET /health`.
- Environment-based configuration and explicit CORS allowlist.
- Bearer-token protection for API routes. The token is server-only and must never be placed in browser code.
- S3-compatible presigned upload forms with a 2 GB default limit and short expiry.
- Redis-backed job records and a queue list.
- Job status endpoint: `GET /v1/jobs/{job_id}`.

## Not implemented yet

The API can issue upload forms and enqueue jobs, but **there is not yet a worker consuming the queue**. It does not analyze footage, write a script, synthesize speech, create captions, or render an MP4 yet. The next milestone is a worker with durable status updates, followed by the AI and FFmpeg pipeline.

The upload and job routes are intentionally protected by `TMC_API_TOKEN`. Do not remove that protection or expose the token to a browser. Before a public launch, connect proper user authentication and authorization so each user can access only their own uploads and jobs.

## Run locally

```bash
cd backend
python -m venv .venv
# Activate the virtual environment, then:
pip install -r requirements.txt
cp .env.example .env
# Set TMC_API_TOKEN, REDIS_URL and S3-compatible storage credentials in .env.
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/health` for the health check and `http://localhost:8000/docs` for the API documentation.

## Upload flow

1. Call `POST /v1/uploads` with `file_name`, `content_type` and `size_bytes`.
2. Submit the returned `fields` and file as multipart form data to the returned `upload_url`.
3. Call `POST /v1/jobs` with the returned `object_key` and file metadata.
4. Poll `GET /v1/jobs/{job_id}` until a worker updates the job.

All API routes require `Authorization: Bearer <TMC_API_TOKEN>`.
