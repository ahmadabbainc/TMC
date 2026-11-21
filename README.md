# TMC — AI Shorts Factory

TMC is a standalone AI Shorts Factory, developed independently from Energy Studio.

## The zero-dollar deployment plan

The application is being configured to run on free tiers only:

- **Cloudflare Pages** hosts the static Next.js website.
- **Supabase Free** provides the Edge Function API, private video storage and job database.
- **GitHub Actions** runs FFmpeg video rendering only when a job is submitted. Standard GitHub-hosted runners are free for public repositories.
- **Gemini API free tier** selects scenes and writes narration when its free quota is available.
- **Edge TTS and FFmpeg** generate the voice track, captions and vertical MP4.

There is no DigitalOcean Droplet, Railway service, Redis server, Cloudflare R2 bucket or always-on video worker.

## Free-tier guardrails

- Uploads are limited to **45 MB** to stay below Supabase Storage's 50 MB free-plan object limit.
- The public demo allows **2 jobs per IP per day** and **5 jobs globally per day**.
- Source uploads are deleted after successful rendering.
- Output videos and abandoned uploads are deleted after 72 hours. Old job records are deleted after 7 days.
- Supabase Free includes 1 GB file storage, a 500 MB database and 5 GB egress. Free projects may pause after a week of inactivity.
- GitHub's standard hosted runners are free for public repositories.
- Gemini's free tier has model and rate limits. Do not enable Google Cloud billing or switch to a paid tier. Google states that free-tier content may be used to improve its products.

Free tiers are limited and can change. We will not enable paid plans or add payment methods. If any provider asks for a card, paid upgrade or billing activation, stop and tell us before proceeding.

## 1. Cloudflare Pages — website

1. Create or sign in to a Cloudflare account at https://dash.cloudflare.com/.
2. Open **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the public repository `ahmadabbainc/TMC`.
4. Select branch `feat/tmc-backend-foundation` for the first preview deployment.
5. Use build command `npm install && npm run build`.
6. Set build output directory to `out`.
7. Add build environment variable `NEXT_PUBLIC_TMC_API_URL` with the Supabase function URL:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/tmc-api`.
8. Deploy. Keep Cloudflare on its Free plan. We do not use R2 or any Cloudflare paid add-on.

## 2. Supabase — API, database and video storage

1. Create a Supabase account at https://supabase.com/dashboard/.
2. Create one project on the **Free** plan. If the signup flow asks for a payment method or paid upgrade, stop.
3. Copy the project reference, project URL, database password and service-role key. Keep the service-role key private.
4. The migration in `supabase/migrations/` creates the job table and a private `tmc-videos` bucket with a 50 MB object limit.
5. The Edge Function is in `supabase/functions/tmc-api/`. Its public routes are rate-limited and the private callback is protected by a random secret.

### Supabase Edge Function secrets

Set these in Supabase Dashboard → Edge Functions → Secrets:

- `GITHUB_TOKEN`: fine-grained GitHub token with Actions read/write permission for `ahmadabbainc/TMC`.
- `CALLBACK_SECRET`: long random secret.
- `APP_ORIGIN`: exact Cloudflare Pages website origin.
- `GITHUB_OWNER`: `ahmadabbainc`.
- `GITHUB_REPO`: `TMC`.
- `GITHUB_WORKFLOW`: `process-video.yml`.
- `GITHUB_BRANCH`: `feat/tmc-backend-foundation`.
- `SUPABASE_BUCKET`: `tmc-videos`.

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically.

## 3. GitHub Actions secrets

In GitHub → TMC → Settings → Secrets and variables → Actions, add:

For deploying the Supabase function:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

For video processing and cleanup:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` (Google AI Studio free tier only)
- `TMC_STATUS_CALLBACK_URL`: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/tmc-api`
- `TMC_CALLBACK_SECRET`: the same value used for Supabase `CALLBACK_SECRET`.

Never put the service-role key, GitHub token, Gemini key or callback secret in frontend code or a `NEXT_PUBLIC_` variable.

## 4. Deploy the Supabase API

After setting the three Supabase deployment secrets in GitHub:

1. Open the repository's Actions tab.
2. Select **Deploy TMC Supabase API**.
3. Choose **Run workflow** on `feat/tmc-backend-foundation`.

The workflow links the Supabase project, applies the database migration and deploys the Edge Function.

## 5. Test TMC

Use a non-sensitive video you own that is no larger than 45 MB. TMC uploads it to private Supabase Storage, starts a GitHub Actions job, renders a vertical MP4, saves the output and provides a temporary download link.

## Local development

Install Node.js 20+ and run:

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_TMC_API_URL` to the deployed Supabase Edge Function URL. The legacy FastAPI/Redis service remains under `backend/` for local experimentation; it is not required by this free deployment path.

## Privacy and safety

Only upload footage you own or are licensed to use. The free Gemini API tier may use submitted content to improve Google's products. The demo does not yet have user accounts, so do not upload confidential or sensitive videos.
