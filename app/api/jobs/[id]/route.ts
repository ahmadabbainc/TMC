import { get, issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const id = context.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid job identifier." }, { status: 400 });
    const result = await get(`jobs/${id}.json`, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: "This job could not be found." }, { status: 404 });
    }
    const job = JSON.parse(await new Response(result.stream).text());
    let outputUrl: string | null = null;
    if (job.status === "completed" && job.output_key) {
      const token = await issueSignedToken({ operations: ["get"] });
      const signed = await presignUrl(token, {
        pathname: job.output_key, operation: "get", validUntil: Date.now() + 30 * 60 * 1000,
      });
      outputUrl = signed.presignedUrl;
    }
    return NextResponse.json({ ...job, output_url: outputUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("TMC job status error", error);
    return NextResponse.json({ error: "Could not check the processing status." }, { status: 500 });
  }
}
