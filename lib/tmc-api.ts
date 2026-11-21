import { NextResponse } from "next/server";

const API_URL = process.env.TMC_API_URL?.replace(/\/$/, "");
const API_TOKEN = process.env.TMC_API_TOKEN;

export async function tmcRequest(path: string, init: RequestInit = {}) {
  if (!API_URL || !API_TOKEN) {
    return NextResponse.json(
      { error: "TMC processing is not configured yet. Add TMC_API_URL and TMC_API_TOKEN to the server environment." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the TMC processing service. Please try again." },
      { status: 502 },
    );
  }
}
