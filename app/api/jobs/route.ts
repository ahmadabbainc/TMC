import { head, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const uploadId = String(body.upload_id || "");
    const objectKey = String(body.object_key || "");
    const fileName = String(body.file_name || "video");
    if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !/^uploads\/[0-9a-f-]{36}\.(mp4|mov|webm|mkv)$/i.test(objectKey) || !objectKey.startsWith(`uploads/${uploadId}.`)) {
      return NextResponse.json({ error: "The upload reference is invalid. Please upload your video again." }, { status: 400 });
    }
    const uploaded = await head(objectKey);
    if (!uploaded || uploaded.size <= 0 || uploaded.size > 45_000_000) {
      return NextResponse.json({ error: "The uploaded video could not be found or is too large." }, { status: 400 });
    }
    const id = randomUUID();
    const initial = {
      id, status: "queued", progress: 3,
      message: "Your video is uploaded. TMC is preparing your Short.",
      object_key: objectKey, file_name: fileName, created_at: new Date().toISOString(),
    };
    await put(`jobs/${id}.json`, JSON.stringify(initial), {
      access: "private", contentType: "application/json", allowOverwrite: true,
    });
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GitHub workflow access is not configured.");
    const dispatch = await fetch("https://api.github.com/repos/ahmadabbainc/TMC/actions/workflows/process-video.yml/dispatches", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { job_id: id, object_key: objectKey, file_name: fileName.slice(0, 180) } }),
      cache: "no-store",
    });
    if (!dispatch.ok) {
      const detail = await dispatch.text();
      throw new Error(`GitHub could not start the video worker (HTTP ${dispatch.status}): ${detail.slice(0, 300)}`);
    }
    return NextResponse.json({ id, status: "queued" });
  } catch (error) {
    console.error("TMC job start error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start video processing." }, { status: 500 });
  }
}
