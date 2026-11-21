import { AwsClient } from "aws4fetch";

interface Env {
  TMC_BUCKET: R2Bucket;
  ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  GITHUB_TOKEN: string;
  CALLBACK_SECRET: string;
  APP_ORIGIN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW: string;
  GITHUB_BRANCH: string;
  MAX_UPLOAD_BYTES: string;
}

type JobRecord = {
  id: string;
  status: "queued" | "analyzing" | "rendering" | "completed" | "failed";
  progress: number;
  message: string;
  created_at: string;
  file_name: string;
  object_key: string;
  output_key?: string;
};

const allowedTypes: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

function corsHeaders(origin: string, env: Env): HeadersInit {
  const allowed = origin === env.APP_ORIGIN || origin === "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : env.APP_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data: unknown, status: number, origin: string, env: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin, env) },
  });
}

function s3Client(env: Env): AwsClient {
  return new AwsClient({
    service: "s3",
    region: "auto",
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
}

async function signedObjectUrl(env: Env, key: string, method: "GET" | "PUT", contentType?: string): Promise<string> {
  const url = new URL(`https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com/tmc-videos/${key}`);
  url.searchParams.set("X-Amz-Expires", method === "PUT" ? "600" : "3600");
  const headers = new Headers();
  if (contentType) headers.set("Content-Type", contentType);
  const signed = await s3Client(env).sign(new Request(url, { method, headers }), {
    aws: { signQuery: true, allHeaders: Boolean(contentType) },
  });
  return signed.url.toString();
}

async function updateJob(env: Env, job: JobRecord): Promise<void> {
  await env.TMC_BUCKET.put(`jobs/${job.id}.json`, JSON.stringify(job), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function readJob(env: Env, id: string): Promise<JobRecord | null> {
  const object = await env.TMC_BUCKET.get(`jobs/${id}.json`);
  if (!object) return null;
  return object.json<JobRecord>();
}

async function dispatchWorkflow(env: Env, job: JobRecord): Promise<void> {
  const endpoint = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "TMC-Edge-API",
    },
    body: JSON.stringify({
      ref: env.GITHUB_BRANCH,
      inputs: { job_id: job.id, object_key: job.object_key, file_name: job.file_name },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub could not start the video job (${response.status}): ${detail.slice(0, 240)}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (origin && origin !== env.APP_ORIGIN && origin !== "http://localhost:3000") {
      return json({ error: "This origin is not allowed." }, 403, origin, env);
    }

    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/api/uploads") {
        const body = await request.json() as { file_name?: string; content_type?: string; size_bytes?: number };
        const fileName = (body.file_name || "").trim();
        const contentType = (body.content_type || "").toLowerCase();
        const extension = fileName.split(".").pop()?.toLowerCase() || "";
        const size = Number(body.size_bytes || 0);
        const maxBytes = Number(env.MAX_UPLOAD_BYTES || 500000000);
        if (!fileName || fileName.length > 180 || /[\\/]/.test(fileName) || !allowedTypes[contentType] || allowedTypes[contentType] !== extension) {
          return json({ error: "Choose a valid MP4, MOV, WebM or MKV video." }, 400, origin, env);
        }
        if (!Number.isFinite(size) || size <= 0 || size > maxBytes) {
          return json({ error: "Your video must be smaller than 500 MB." }, 413, origin, env);
        }
        const objectKey = `uploads/${crypto.randomUUID().replaceAll("-", "")}.${extension}`;
        const uploadUrl = await signedObjectUrl(env, objectKey, "PUT", contentType);
        return json({
          upload_url: uploadUrl,
          upload_headers: { "Content-Type": contentType },
          upload_method: "PUT",
          object_key: objectKey,
          expires_in: 600,
          max_upload_bytes: maxBytes,
        }, 200, origin, env);
      }

      if (request.method === "POST" && url.pathname === "/api/jobs") {
        const body = await request.json() as { object_key?: string; file_name?: string };
        const objectKey = body.object_key || "";
        const fileName = body.file_name || "";
        if (!/^uploads\/[a-f0-9]{32}\.(mp4|mov|webm|mkv)$/.test(objectKey) || !fileName || fileName.length > 180) {
          return json({ error: "Invalid uploaded video reference." }, 400, origin, env);
        }
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const day = new Date().toISOString().slice(0, 10);
        const rateKey = `limits/${day}/${encodeURIComponent(ip)}.json`;
        const rateObject = await env.TMC_BUCKET.get(rateKey);
        const rate = rateObject ? await rateObject.json<{ count: number }>() : { count: 0 };
        if (rate.count >= 3) {
          return json({ error: "Free demo limit reached: 3 video jobs per IP per day." }, 429, origin, env);
        }
        await env.TMC_BUCKET.put(rateKey, JSON.stringify({ count: rate.count + 1 }), {
          httpMetadata: { contentType: "application/json" },
        });
        const id = crypto.randomUUID().replaceAll("-", "");
        const job: JobRecord = {
          id, status: "queued", progress: 0,
          message: "Your video is queued for processing.",
          created_at: new Date().toISOString(),
          file_name: fileName, object_key: objectKey,
        };
        await updateJob(env, job);
        try {
          await dispatchWorkflow(env, job);
        } catch (error) {
          job.status = "failed";
          job.message = error instanceof Error ? error.message : "Could not start video processing.";
          await updateJob(env, job);
          return json({ error: job.message }, 502, origin, env);
        }
        return json({ id, status: job.status }, 202, origin, env);
      }

      const statusMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9]{32})\/status$/);
      if (request.method === "POST" && statusMatch) {
        if (request.headers.get("Authorization") !== `Bearer ${env.CALLBACK_SECRET}`) {
          return json({ error: "Unauthorized." }, 401, origin, env);
        }
        const job = await readJob(env, statusMatch[1]);
        if (!job) return json({ error: "Job not found." }, 404, origin, env);
        const body = await request.json() as Partial<JobRecord>;
        if (body.status) job.status = body.status as JobRecord["status"];
        if (typeof body.progress === "number") job.progress = Math.max(0, Math.min(100, body.progress));
        if (typeof body.message === "string") job.message = body.message.slice(0, 500);
        if (typeof body.output_key === "string" && body.output_key.startsWith("outputs/")) job.output_key = body.output_key;
        await updateJob(env, job);
        return json({ ok: true }, 200, origin, env);
      }

      const jobMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9]{32})$/);
      if (request.method === "GET" && jobMatch) {
        const job = await readJob(env, jobMatch[1]);
        if (!job) return json({ error: "Job not found." }, 404, origin, env);
        const outputUrl = job.status === "completed" && job.output_key
          ? await signedObjectUrl(env, job.output_key, "GET")
          : null;
        return json({
          id: job.id, status: job.status, progress: job.progress,
          message: job.message, output_url: outputUrl,
        }, 200, origin, env);
      }

      return json({ error: "Not found." }, 404, origin, env);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500, origin, env);
    }
  },
};
