# TMC — AI Shorts Factory

TMC turns long-form video into ready-to-publish vertical Shorts.

## Product
- Create Short: one upload flow and a 60-second 9:16 output target.
- Your Projects: a simple home for generated videos and progress.
- Settings: voice, captions and preferences.
- Dark and light themes.

## Stack
Next.js App Router, React, TypeScript, Tailwind CSS and Lucide. The frontend is designed to connect to a separate Python/FFmpeg worker for long-running rendering.

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Status
This starter commit establishes the original TMC frontend and interactive local video selection. AI analysis, script writing, voice generation, uploads, storage and FFmpeg rendering are not connected yet. Long-running rendering belongs in a worker service, not a Vercel request.

Only upload footage you own or are licensed to use.
