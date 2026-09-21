import { NextResponse } from "next/server";
import {
  assertProductionStorage,
  isBlobReady,
  isKvReady,
  isVercelProduction,
} from "@/lib/server/storageHealth";
import { applySecurityHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Healthcheck público mínimo (sin detalles de configuración ni secretos).
 * Útil para uptime monitors; no expone qué dependencias fallan.
 */
export async function GET() {
  const storage = assertProductionStorage();
  const sessionOk = Boolean(
    process.env.ADMIN_SESSION_SECRET &&
      process.env.ADMIN_SESSION_SECRET.trim().length >= 32 &&
      !/change-me|rgmotors-dev/i.test(process.env.ADMIN_SESSION_SECRET),
  );
  const cronOk = Boolean(
    process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length >= 16,
  );

  const ok =
    !isVercelProduction() ||
    (storage.ok && sessionOk && cronOk && isBlobReady() && isKvReady());

  const res = NextResponse.json(
    {
      ok,
      status: ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
  return applySecurityHeaders(res);
}
