# TMC — AI Shorts Factory

TMC turns long-form video into ready-to-publish vertical Shorts.

## Product
- Create Short: one upload flow and a 60-second 9:16 output target.
- Your Projects: a simple home for generated videos and progress.
- Settings: voice, captions and preferences.
- Dark and light themes.

## Stack
Next.js App Router, React, TypeScript, Tailwind CSS and Lucide. The frontend connects to a separate Python API and background worker for long-running video processing. The initial FastAPI service scaffold lives in `backend/`.

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Status
The frontend foundation and initial FastAPI service scaffold are in place. AI analysis, script writing, voice generation, durable uploads, storage and FFmpeg rendering are not connected yet. See [backend/README.md](backend/README.md) for the API status and local setup. Long-running rendering belongs in a worker service, not a Vercel request.

Only upload footage you own or are licensed to use.
