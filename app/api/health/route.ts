import { NextResponse } from "next/server";
import {
  assertProductionStorage,
  isBlobReady,
  isKvReady,
  isVercelProduction,
} from "@/lib/server/storageHealth";
import { applySecurityHeaders } from "@/lib/server/security";
import { isGoogleDriveOAuthConfigured } from "@/lib/server/googleDriveClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Healthcheck público (sin secretos): KV/Blob/session config. */
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
  const driveOAuthOk = isGoogleDriveOAuthConfigured();

  const body = {
    ok: !isVercelProduction() || (storage.ok && sessionOk && cronOk && isBlobReady()),
    env: isVercelProduction() ? "production" : process.env.VERCEL_ENV || "local",
    checks: {
      kv: isKvReady(),
      blob: isBlobReady(),
      adminSessionSecret: sessionOk,
      cronSecret: cronOk,
      driveOAuth: driveOAuthOk,
      resend: Boolean(process.env.RESEND_API_KEY?.trim()),
    },
    warnings: storage.warnings,
    timestamp: new Date().toISOString(),
  };

  const res = NextResponse.json(body, {
    status: body.ok ? 200 : 503,
  });
  return applySecurityHeaders(res);
}
