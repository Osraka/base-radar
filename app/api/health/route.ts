import { NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security";

export async function GET() {
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  return NextResponse.json(
    {
      ok: true,
      app: "base-radar",
      mode: useMockData ? "mock" : "supabase",
      timestamp: new Date().toISOString()
    },
    { headers: securityHeaders() }
  );
}
