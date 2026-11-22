import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 45_000_000;
const TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { contentType?: string; size?: number } = {};
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {
          throw new Error("Invalid upload details.");
        }
        const extension = payload.contentType ? TYPES[payload.contentType] : undefined;
        const match = pathname.match(/^uploads\/([0-9a-f-]{36})\.(mp4|mov|webm|mkv)$/i);
        if (!extension || !match || match[2].toLowerCase() !== extension ||
            !Number.isFinite(payload.size) || Number(payload.size) <= 0 || Number(payload.size) > MAX_UPLOAD_BYTES) {
          throw new Error("Choose an MP4, MOV, WebM or MKV video up to 45 MB.");
        }
        return {
          allowedContentTypes: [payload.contentType!],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("TMC client upload error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare the secure upload." },
      { status: 400 },
    );
  }
}
