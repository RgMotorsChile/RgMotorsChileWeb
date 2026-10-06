import { NextRequest, NextResponse } from "next/server";
import { runAutoSync, getAutoSyncStatus } from "@/lib/server/autoSyncScheduler";
import { syncDrivePhotosViaOAuth } from "@/lib/server/driveOAuthSyncService";
import { isGoogleDriveOAuthConfigured } from "@/lib/server/googleDriveClient";
import { syncFromLiveGoogleSheet } from "@/lib/server/googleSheetSyncService";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Sync Sheets + Drive puede tardar; Hobby permite hasta 60s, Pro más. */
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  return authorizeMachineSecret(req, ["CRON_SECRET"], {
    allowQuerySecret: true,
    allowQueryInProd: process.env.CRON_ALLOW_QUERY_SECRET === "1",
    searchParams: req.nextUrl.searchParams,
    logLabel: "CronSync",
  });
}

function resolveTenant(req: NextRequest): "rg-motors" | "unidades-chile" {
  const raw = req.nextUrl.searchParams.get("tenant");
  if (raw === "unidades-chile" || raw === "rg-motors") return raw;
  // Vercel Cron no admite query: 12:00 UTC ≈ 9:00 Chile → Unidades Chile
  return new Date().getUTCHours() === 12 ? "unidades-chile" : "rg-motors";
}

async function runDailySync(
  req: NextRequest,
  opts?: { only?: "sheet" | "drive" | "all" },
) {
  const only = opts?.only || "all";
  const tenantSlug = resolveTenant(req);
  console.log("[CronSync] Ejecutando sincronización…", { only, tenantSlug });

  const sheetResult =
    only === "drive"
      ? {
          success: true,
          message: "Sheets omitido (only=drive).",
          updated: 0,
        }
      : await syncFromLiveGoogleSheet(undefined, { tenantSlug });

  const driveResult =
    only === "sheet"
      ? { success: true, message: "Drive omitido (only=sheet)." }
      : tenantSlug === "unidades-chile"
        ? isGoogleDriveOAuthConfigured()
          ? await syncDrivePhotosViaOAuth({ tenantSlug })
          : {
              success: false,
              message:
                "Drive OAuth no configurado: no se pueden bajar fotos de la carpeta restringida para Unidades Chile.",
            }
        : await runAutoSync();

  const sheetOk = Boolean(sheetResult.success);
  const driveOk = Boolean(driveResult.success);
  const success = sheetOk && driveOk;
  const partial = !success && (sheetOk || driveOk);
  if (partial) {
    console.warn("[CronSync] Sync parcial:", {
      tenantSlug,
      sheetOk,
      driveOk,
      sheetMessage: sheetResult.message,
      driveMessage: (driveResult as { message?: string }).message,
    });
  }
  return {
    success,
    partial,
    tenant: tenantSlug,
    sheetSync: sheetResult,
    driveSync: driveResult,
    status: getAutoSyncStatus(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Vercel Cron llama GET con Authorization: Bearer CRON_SECRET.
 * 11:00 UTC → RG. 12:00 UTC → Unidades Chile (9:00 Chile).
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("status") === "1") {
    return NextResponse.json({
      status: "ok",
      ...getAutoSyncStatus(),
    });
  }

  try {
    const onlyParam = req.nextUrl.searchParams.get("only");
    const only =
      onlyParam === "sheet" || onlyParam === "drive" ? onlyParam : "all";
    const result = await runDailySync(req, { only });
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
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await runDailySync(req);
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
