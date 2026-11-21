# Legacy local FastAPI and Redis renderer

This folder contains the original local/server deployment prototype. **It is not required for the $0 Cloudflare Pages + Supabase + GitHub Actions deployment path.**

The free deployment uses:

- `supabase/functions/tmc-api/` for the API.
- Supabase Storage for uploaded and completed videos.
- `backend/process_action.py` for on-demand GitHub Actions rendering.
- `backend/cleanup_storage.py` for scheduled Supabase storage cleanup.

The legacy API and Redis worker below are retained for local experimentation only. Do not deploy them to a paid always-on server.

## Local prototype requirements

- Redis-compatible queue.
- S3-compatible object storage (Cloudflare R2 was used by the prototype).
- Gemini API key.
- A private random `TMC_API_TOKEN`.

The local API and worker commands are still available if you want to experiment with the original architecture, but they are not part of the zero-budget production plan.
