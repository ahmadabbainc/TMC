import { issueSignedToken, presignUrl } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 45_000_000;
const TYPES: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov",
  "video/webm": "webm", "video/x-matroska": "mkv",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const contentType = typeof body.content_type === "string" ? body.content_type : "";
    const size = Number(body.size_bytes);
    const extension = TYPES[contentType];
    if (!extension || !Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Choose an MP4, MOV, WebM or MKV video up to 45 MB." }, { status: 400 });
    }
    const uploadId = randomUUID();
    const objectKey = `uploads/${uploadId}.${extension}`;
    const token = await issueSignedToken({ operations: ["put"] });
    const { presignedUrl } = await presignUrl(token, {
      pathname: objectKey, operation: "put", validUntil: Date.now() + 15 * 60 * 1000,
    });
    return NextResponse.json({
      upload_id: uploadId, object_key: objectKey, upload_url: presignedUrl,
      upload_method: "PUT", upload_headers: { "Content-Type": contentType },
    });
  } catch (error) {
    console.error("TMC upload URL error", error);
    return NextResponse.json({ error: "Secure upload is not configured. Please try again later." }, { status: 500 });
  }
}
