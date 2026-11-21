# TMC — AI Shorts Factory

TMC is a standalone AI Shorts Factory. It is developed independently from Energy Studio.

## What is in this branch

- A simple Next.js workspace with Create Short, Your Projects and Settings sections.
- Video upload flow using short-lived S3-compatible presigned upload forms.
- Server-side Next.js API routes that keep the internal TMC API token out of browser JavaScript.
- A FastAPI service with health checks, upload signing and job status endpoints.
- A Redis queue and a separate worker process.
- A first rendering pipeline: Gemini scene selection and narration planning, Edge TTS voice generation, timed captions and FFmpeg vertical MP4 rendering.
- Backend schema tests and separate backend/frontend GitHub Actions checks.

## Important: external services are required

The application is not ready for public production use until the external services and secrets are configured. The API and worker require:

- Redis-compatible queue service.
- S3-compatible object storage (Cloudflare R2 is supported).
- Gemini API key.
- A private random `TMC_API_TOKEN`, configured only in the API and Next.js server environments.
- A deployed API and continuously running worker.

The browser uploads video directly to object storage using a time-limited upload form. The Next.js server then forwards job requests to the private API. Do not put `TMC_API_TOKEN` in a `NEXT_PUBLIC_*` variable.

For public multi-user use, add user authentication, per-user job ownership, rate limiting, storage lifecycle rules and operational monitoring before inviting users. The internal bearer token is service-to-service protection, not user login.

## Run the frontend locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The UI will show a clear configuration error until the API URL and token are configured.

## Run the API and worker

See [backend/README.md](backend/README.md) for Python dependencies, environment configuration, and the separate API and worker commands.

## Deployment layout

- Frontend: Vercel or another Next.js host.
- API: a Python container host.
- Worker: a separate always-on Python container with FFmpeg installed.
- Queue: managed Redis/Valkey.
- Video storage: S3-compatible object storage.

The worker must remain running independently of Vercel so long video processing does not depend on serverless request time limits.

## Copyright and safety

Only upload footage you own or are licensed to use.
