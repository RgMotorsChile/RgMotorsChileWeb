import { NextRequest, NextResponse } from "next/server";
import { recordPageview } from "@/lib/server/pageviewsStore";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { applySecurityHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limited = await rateLimitAsync(`pageview:${ip}`, 120, 60_000);
  if (!limited.ok) {
    const res = NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 });
    return applySecurityHeaders(res);
  }

  let body: { path?: string; sessionId?: string } = {};
  try {
    body = (await req.json()) as { path?: string; sessionId?: string };
  } catch {
    const res = NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    return applySecurityHeaders(res);
  }

  const path = String(body.path || "").slice(0, 200);
  const sessionId = String(body.sessionId || "").slice(0, 64);
  if (!path || !sessionId) {
    const res = NextResponse.json(
      { error: "Faltan path o sessionId." },
      { status: 400 },
    );
    return applySecurityHeaders(res);
  }

  await recordPageview({ path, sessionId });
  const res = NextResponse.json({ ok: true });
  return applySecurityHeaders(res);
}
