import { NextRequest, NextResponse } from "next/server";
import { runAutoSync, getAutoSyncStatus } from "@/lib/server/autoSyncScheduler";
import { syncFromLiveGoogleSheet } from "@/lib/server/googleSheetSyncService";
import { timingSafeEqualString } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Sync Sheets + Drive puede tardar; Hobby permite hasta 60s, Pro más. */
export const maxDuration = 60;

function authorizeCron(req: NextRequest): { ok: boolean } {
  const secret = process.env.CRON_SECRET?.trim();
  const isProd =
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL === "1");

  if (!secret || secret.length < 16) {
    if (isProd) return { ok: false };
    console.warn("[CronSync] CRON_SECRET ausente — solo permitido en desarrollo.");
    return { ok: true };
  }

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // Query secret solo en no-prod o con flag explícito (evita leaks en logs/Referer).
  const allowQuery =
    !isProd || process.env.CRON_ALLOW_QUERY_SECRET === "1";
  const querySecret = allowQuery
    ? req.nextUrl.searchParams.get("secret") || ""
    : "";
  const provided = bearer || querySecret;

  if (!provided || !timingSafeEqualString(provided, secret)) {
    return { ok: false };
  }
  return { ok: true };
}

async function runDailySync() {
  console.log("[CronSync] Ejecutando sincronización de Google Sheets e inventario...");
  const sheetResult = await syncFromLiveGoogleSheet();
  const driveResult = await runAutoSync();
  const sheetOk = Boolean(sheetResult.success);
  const driveOk = Boolean(driveResult.success);
  const success = sheetOk && driveOk;
  const partial = !success && (sheetOk || driveOk);
  if (partial) {
    console.warn("[CronSync] Sync parcial:", {
      sheetOk,
      driveOk,
      sheetMessage: sheetResult.message,
      driveMessage: (driveResult as { message?: string }).message,
    });
  }
  return {
    success,
    partial,
    sheetSync: sheetResult,
    driveSync: driveResult,
    status: getAutoSyncStatus(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Vercel Cron llama GET con Authorization: Bearer CRON_SECRET.
 * Antes solo devolvía status y el sync nunca corría.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // ?status=1 → solo estado (para health manual sin disparar sync)
  if (req.nextUrl.searchParams.get("status") === "1") {
    return NextResponse.json({
      status: "ok",
      ...getAutoSyncStatus(),
    });
  }

  try {
    const result = await runDailySync();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[CronSync] Falló el sync diario:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error en sync diario",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await runDailySync();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[CronSync] Falló el sync (POST):", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error en sync",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
