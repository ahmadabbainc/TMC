# TMC — AI Shorts Factory

TMC is a standalone AI Shorts Factory, developed independently from Energy Studio.

## Architecture

- **Vercel** hosts the Next.js website and its small server-side API routes.
- **Vercel Blob (private)** temporarily stores uploaded videos, job status and finished Shorts.
- **GitHub Actions** runs the video-processing worker and FFmpeg.
- **Google Gemini API** analyses the uploaded movie and writes the narration.
- **Edge TTS** creates the voice-over; FFmpeg creates the vertical video and captions.

Supabase is not used. Cloudflare, Railway, DigitalOcean, Redis and a separate always-on server are not required.

## Free-tier guardrails

- Uploads and finished videos are limited to 45 MB each.
- Use only Vercel Hobby, GitHub public-repository Actions and Gemini API free-tier quota.
- Source uploads are deleted after successful rendering.
- Private Blob storage is used; browser upload and download links are short-lived and scoped to one file and operation.
- Do not enable billing, add a payment method or switch to a paid tier. Stop if a provider requires payment.
- Free quotas and terms can change. Monitor Vercel Blob storage/transfer and Gemini quota before repeated use.

## Required configuration

### Vercel project

Connect the private Blob store named `tmc-videos` to the TMC Vercel project and select **Private** access. Vercel adds `BLOB_READ_WRITE_TOKEN` to the connected project's environment.

Add `GITHUB_TOKEN` to the Vercel project's environment. It must be a fine-grained GitHub token scoped to `ahmadabbainc/TMC` with **Actions: Read and write** permission. Never expose it in browser code.

### GitHub Actions secrets

In GitHub → TMC → Settings → Secrets and variables → Actions, add:

- `BLOB_READ_WRITE_TOKEN`: the Vercel Blob read/write token from the TMC project's environment.
- `GEMINI_API_KEY`: a Google AI Studio API key using the free tier only.

Never put either secret in frontend code or commit a real value to this repository.

## Processing flow

1. The browser requests a short-lived upload URL from the TMC API.
2. The browser uploads directly to private Vercel Blob.
3. The TMC API dispatches the GitHub Actions workflow.
4. GitHub Actions downloads the private source, Gemini analyses it, Edge TTS creates narration, and FFmpeg renders a 9:16 Short with captions.
5. The worker stores the result in private Blob and updates the job status.
6. The website provides a short-lived download URL.

## Local development

Install Node.js 20+ and run:

```bash
npm install
npm run dev
```

The API routes require a connected Vercel Blob store and a GitHub token. The video worker runs in GitHub Actions.

## Privacy

Only upload footage you own or are licensed to use. Gemini API free-tier content may be used by Google to improve its products. The demo does not yet have user accounts, so do not upload confidential or sensitive videos.
