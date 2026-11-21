# TMC — AI Shorts Factory

TMC is a standalone AI Shorts Factory, developed independently from Energy Studio.

## The $0 deployment architecture

TMC is being configured to run without a paid always-on server:

- **Cloudflare Pages** hosts the static Next.js website.
- **Cloudflare Workers Free** provides the small upload/job API.
- **Cloudflare R2** stores uploaded videos and finished Shorts within its free allowance.
- **GitHub Actions** starts an on-demand Linux runner to render each video. Standard GitHub-hosted runners are free for public repositories.
- **Gemini API free tier** selects scenes and writes narration when the account/model quota is available.
- **Edge TTS and FFmpeg** create the voice track, captions and vertical MP4.

No Railway, DigitalOcean Droplet, Redis server, or continuously running worker is needed for this deployment path.

## Important cost safeguards

- The upload API rejects files larger than 200 MB.
- The public demo is limited to 2 jobs per IP per day and 5 jobs globally per day.
- Old job records, rate-limit records and output files are deleted after 72 hours.
- The GitHub workflow uses the standard `ubuntu-latest` runner on this public repository.
- Keep Cloudflare on its Free plan. Do not enable paid Workers or other paid add-ons.
- R2 includes a limited free allowance, not unlimited storage. The 72-hour cleanup and daily job cap help keep usage small. Check the Cloudflare usage dashboard and do not upgrade or add a paid plan.
- Gemini's free tier has model and rate limits. Do not enable Google Cloud billing or switch the API key to a paid tier. Google states that free-tier content may be used to improve its products; do not upload confidential footage.

Free tiers can change and are quota-limited. No cloud service can promise unlimited usage for $0. If a provider asks for a paid upgrade or payment to continue, stop and tell us before proceeding.

## Deployment setup

### 1. Create the Cloudflare resources

1. Create or sign in to a Cloudflare account: https://dash.cloudflare.com/
2. Stay on the Free plan.
3. Create an R2 bucket named `tmc-videos`.
4. Create an R2 API token scoped only to that bucket with Object Read and Write permissions. Save its Access Key ID and Secret Access Key privately.
5. Configure bucket CORS to allow your exact Pages website origin and `PUT` with the `Content-Type` header. Example:

```json
[
  {
    "AllowedOrigins": ["https://tmc.pages.dev"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 2. Create the Cloudflare Worker API

The Worker is configured in `cloudflare/worker/wrangler.toml`. It expects these secrets in the Worker settings:

- `ACCOUNT_ID`: Cloudflare account ID.
- `R2_ACCESS_KEY_ID`: R2 API access key.
- `R2_SECRET_ACCESS_KEY`: R2 API secret.
- `GITHUB_TOKEN`: fine-grained GitHub token with Actions read/write access to `ahmadabbainc/TMC`.
- `CALLBACK_SECRET`: a long random secret shared with the GitHub video workflow.

The non-secret `APP_ORIGIN` value in `wrangler.toml` must match the actual Cloudflare Pages URL.

### 3. Configure GitHub Actions secrets

In GitHub, open Settings → Secrets and variables → Actions → New repository secret. Add:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permission to deploy Workers.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- `R2_ENDPOINT`: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
- `R2_BUCKET`: `tmc-videos`.
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: the R2 bucket credentials.
- `GEMINI_API_KEY`: key created in Google AI Studio using the free tier only.
- `TMC_STATUS_CALLBACK_URL`: the deployed Worker URL, for example `https://tmc-edge-api.<your-subdomain>.workers.dev`.
- `TMC_CALLBACK_SECRET`: same random secret configured on the Worker as `CALLBACK_SECRET`.

The Worker also needs its `GITHUB_TOKEN` secret. Never put any of these secrets in frontend code or a `NEXT_PUBLIC_` variable.

### 4. Deploy the Worker

After adding the Cloudflare deployment secrets, open the repository's Actions tab and manually run **Deploy TMC Cloudflare API**.

Then add the Worker secrets listed above in Cloudflare Dashboard → Workers & Pages → tmc-edge-api → Settings → Variables and Secrets.

### 5. Deploy the website

1. In Cloudflare Dashboard, open Workers & Pages → Create → Pages → Connect to Git.
2. Select `ahmadabbainc/TMC` and branch `feat/tmc-backend-foundation` for the first preview deployment.
3. Set the build command to `npm install && npm run build`.
4. Set the build output directory to `out`.
5. Add the build environment variable `NEXT_PUBLIC_TMC_API_URL` with the deployed Worker URL.
6. Deploy, then update `APP_ORIGIN` in the Worker configuration and R2 CORS to the exact Pages URL.

### 6. Test the video pipeline

Use a short, non-sensitive video you own. The upload limit is 200 MB. A successful run uploads the video to R2, starts a GitHub Actions job, renders the vertical MP4, stores the result in R2 and returns a temporary download link.

## Local development

Install Node.js 20+ and run:

```bash
npm install
npm run dev
```

The UI expects `NEXT_PUBLIC_TMC_API_URL` to point to a deployed Cloudflare Worker. The legacy FastAPI/Redis worker remains in `backend/` for local experimentation and is not required by the free Cloudflare deployment.

## Privacy and safety

Only upload footage you own or are licensed to use. The free Gemini API tier may use submitted content to improve Google's products. The demo has no user accounts, so it is not suitable for confidential or sensitive videos.
