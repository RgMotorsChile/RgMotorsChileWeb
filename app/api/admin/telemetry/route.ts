import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { buildTelemetryReport } from "@/lib/server/telemetryService";
import { applySecurityHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) {
    const res = NextResponse.json({ error: "No autorizado." }, { status: 401 });
    return applySecurityHeaders(res);
  }

  try {
    const report = await buildTelemetryReport();
    const res = NextResponse.json(report);
    res.headers.set("Cache-Control", "private, no-store");
    return applySecurityHeaders(res);
  } catch (err) {
    console.error("[Telemetry]", err);
    const res = NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "No se pudo armar el reporte.",
      },
      { status: 500 },
    );
    return applySecurityHeaders(res);
  }
}
