import { NextRequest } from "next/server";
import { tmcRequest } from "@/lib/tmc-api";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return Response.json({ error: "Invalid job request." }, { status: 400 });
  }
  return tmcRequest("/v1/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
