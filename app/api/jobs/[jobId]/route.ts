import { tmcRequest } from "@/lib/tmc-api";

export async function GET(
  _request: Request,
  context: { params: { jobId: string } },
) {
  const { jobId } = context.params;
  if (!/^[a-f0-9]{32}$/.test(jobId)) {
    return Response.json({ error: "Invalid job ID." }, { status: 400 });
  }
  return tmcRequest(`/v1/jobs/${jobId}`, { method: "GET" });
}
