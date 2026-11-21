# TMC API

The API is a separate Python service. It is intentionally kept outside the Next.js app so video analysis and rendering can run in a worker without Vercel request time limits.

## Current status

This first backend milestone provides:
- A FastAPI application and deployment health endpoint (`GET /health`).
- Environment-based configuration and an explicit CORS allowlist.
- Shared job status schemas for the upcoming upload and processing endpoints.

**The AI processing pipeline is not connected yet.** No video is uploaded, analyzed, stored, or rendered by this milestone. The next implementation step is durable upload storage and a background job queue, followed by scene analysis, narration, voice, captions, and FFmpeg rendering.

## Run locally

```bash
cd backend
python -m venv .venv
# Activate the virtual environment, then:
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/health` for the health check and `http://localhost:8000/docs` for the API documentation.
