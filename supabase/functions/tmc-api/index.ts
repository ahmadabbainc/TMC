import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secretKeys.default || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://tmc.pages.dev";
const CALLBACK_SECRET = Deno.env.get("CALLBACK_SECRET") || "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER") || "ahmadabbainc";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") || "TMC";
const GITHUB_WORKFLOW = Deno.env.get("GITHUB_WORKFLOW") || "process-video.yml";
const GITHUB_BRANCH = Deno.env.get("GITHUB_BRANCH") || "main";
const BUCKET = Deno.env.get("SUPABASE_BUCKET") || "tmc-videos";
const MAX_UPLOAD_BYTES = 45_000_000;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedTypes: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

function cors(origin: string): HeadersInit {
  const allowed = origin === APP_ORIGIN || origin === "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : APP_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function reply(data: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function getClientIp(request: Request): string {
  return request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

async function dispatch(job: { id: string; object_key: string; file_name: string }) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "TMC-Supabase-Function",
      },
      body: JSON.stringify({
        ref: GITHUB_BRANCH,
        inputs: { job_id: job.id, object_key: job.object_key, file_name: job.file_name },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub could not start the video job (${response.status}): ${detail.slice(0, 240)}`);
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (origin && origin !== APP_ORIGIN && origin !== "http://localhost:3000") {
    return reply({ error: "This website origin is not allowed." }, 403, origin);
  }

  const pathname = new URL(request.url).pathname;
  // Supabase's gateway may expose the function path with or without its
  // public /functions/v1 prefix. Normalize all supported forms to /api/...
  const apiPathIndex = pathname.indexOf("/api/");
  const path = apiPathIndex >= 0
    ? pathname.slice(apiPathIndex)
    : pathname.replace(/^\/(?:functions\/v1\/)?tmc-api\/?/, "") || "/";
  try {
    if (request.method === "POST" && path === "/api/uploads") {
      const body = await request.json() as { file_name?: string; content_type?: string; size_bytes?: number };
      const fileName = (body.file_name || "").trim();
      const contentType = (body.content_type || "").toLowerCase();
      const extension = fileName.split(".").pop()?.toLowerCase() || "";
      const size = Number(body.size_bytes || 0);
      if (!fileName || fileName.length > 180 || /[\\/]/.test(fileName)
        || !allowedTypes[contentType] || allowedTypes[contentType] !== extension) {
        return reply({ error: "Choose a valid MP4, MOV, WebM or MKV video." }, 400, origin);
      }
      if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
        return reply({ error: "The free plan allows videos up to 45 MB." }, 413, origin);
      }

      const ip = getClientIp(request);
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const [{ count: ipCount }, { count: globalCount }] = await Promise.all([
        supabase.from("tmc_jobs").select("id", { count: "exact", head: true })
          .eq("client_ip", ip).gte("created_at", since.toISOString()),
        supabase.from("tmc_jobs").select("id", { count: "exact", head: true })
          .gte("created_at", since.toISOString()),
      ]);
      if ((ipCount || 0) >= 2) return reply({ error: "Free demo limit reached: 2 video jobs per IP per day." }, 429, origin);
      if ((globalCount || 0) >= 5) return reply({ error: "TMC has reached its free daily processing limit. Please try tomorrow." }, 429, origin);

      const id = crypto.randomUUID().replaceAll("-", "");
      const objectKey = `uploads/${id}.${extension}`;
      const { data: signed, error: signError } = await supabase.storage.from(BUCKET)
        .createSignedUploadUrl(objectKey);
      if (signError || !signed) return reply({ error: signError?.message || "Could not prepare upload." }, 503, origin);

      const { error: insertError } = await supabase.from("tmc_jobs").insert({
        id, status: "uploading", progress: 0, message: "Preparing your upload.",
        file_name: fileName, object_key: objectKey, size_bytes: size, client_ip: ip,
      });
      if (insertError) return reply({ error: "Could not create your video job." }, 503, origin);

      return reply({
        upload_url: signed.signedUrl,
        upload_headers: { "Content-Type": contentType },
        upload_method: "PUT",
        object_key: objectKey,
        upload_id: id,
        expires_in: 7200,
        max_upload_bytes: MAX_UPLOAD_BYTES,
      }, 200, origin);
    }

    if (request.method === "POST" && path === "/api/jobs") {
      const body = await request.json() as { upload_id?: string; object_key?: string; file_name?: string };
      const id = body.upload_id || "";
      if (!/^[a-f0-9]{32}$/.test(id)) return reply({ error: "Invalid upload reference." }, 400, origin);
      const { data: job, error } = await supabase.from("tmc_jobs").select("*").eq("id", id).maybeSingle();
      if (error || !job || job.object_key !== body.object_key || job.file_name !== body.file_name) {
        return reply({ error: "Uploaded video reference was not found." }, 404, origin);
      }
      const { error: updateError } = await supabase.from("tmc_jobs")
        .update({ status: "queued", message: "Your video is queued for processing.", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) return reply({ error: "Could not queue your video." }, 503, origin);
      try {
        await dispatch({ id, object_key: job.object_key, file_name: job.file_name });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not start video processing.";
        await supabase.from("tmc_jobs").update({ status: "failed", message }).eq("id", id);
        return reply({ error: message }, 502, origin);
      }
      return reply({ id, status: "queued" }, 202, origin);
    }

    const callbackMatch = path.match(/^\/api\/jobs\/([a-f0-9]{32})\/status$/);
    if (request.method === "POST" && callbackMatch) {
      if (!CALLBACK_SECRET || request.headers.get("Authorization") !== `Bearer ${CALLBACK_SECRET}`) {
        return reply({ error: "Unauthorized." }, 401, origin);
      }
      const body = await request.json() as { status?: string; progress?: number; message?: string; output_key?: string };
      const allowedStatuses = ["analyzing", "rendering", "completed", "failed"];
      if (!body.status || !allowedStatuses.includes(body.status)) return reply({ error: "Invalid status." }, 400, origin);
      const update: Record<string, unknown> = {
        status: body.status,
        progress: Math.max(0, Math.min(100, Number(body.progress || 0))),
        message: String(body.message || "").slice(0, 500),
        updated_at: new Date().toISOString(),
      };
      if (body.output_key?.startsWith("outputs/")) update.output_key = body.output_key;
      const { error } = await supabase.from("tmc_jobs").update(update).eq("id", callbackMatch[1]);
      if (error) return reply({ error: "Could not update job status." }, 503, origin);
      return reply({ ok: true }, 200, origin);
    }

    const jobMatch = path.match(/^\/api\/jobs\/([a-f0-9]{32})$/);
    if (request.method === "GET" && jobMatch) {
      const { data: job, error } = await supabase.from("tmc_jobs").select("*").eq("id", jobMatch[1]).maybeSingle();
      if (error || !job) return reply({ error: "Job not found." }, 404, origin);
      let outputUrl: string | null = null;
      if (job.status === "completed" && job.output_key) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(job.output_key, 3600, { download: true });
        outputUrl = signed?.signedUrl || null;
      }
      return reply({
        id: job.id, status: job.status, progress: job.progress,
        message: job.message, output_url: outputUrl,
      }, 200, origin);
    }

    return reply({ error: "Not found." }, 404, origin);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500, origin);
  }
});
