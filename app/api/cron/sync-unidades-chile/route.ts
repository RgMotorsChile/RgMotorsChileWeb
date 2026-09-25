import { NextRequest, NextResponse } from "next/server";
import { getAutoSyncStatus } from "@/lib/server/autoSyncScheduler";
import { syncDrivePhotosViaOAuth } from "@/lib/server/driveOAuthSyncService";
import { isGoogleDriveOAuthConfigured } from "@/lib/server/googleDriveClient";
import { syncFromLiveGoogleSheet } from "@/lib/server/googleSheetSyncService";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TENANT = "unidades-chile" as const;

function authorizeCron(req: NextRequest): boolean {
  return authorizeMachineSecret(req, ["CRON_SECRET"], {
    allowQuerySecret: true,
    allowQueryInProd: process.env.CRON_ALLOW_QUERY_SECRET === "1",
    searchParams: req.nextUrl.searchParams,
    logLabel: "CronSyncUc",
  });
}

async function runUnidadesChileSync() {
  console.log("[CronSyncUc] Sync 9:00 Chile — pestaña UNIDADES CHILE + Drive");

  const sheetResult = await syncFromLiveGoogleSheet(undefined, {
    tenantSlug: TENANT,
  });

  const driveResult = isGoogleDriveOAuthConfigured()
    ? await syncDrivePhotosViaOAuth({ tenantSlug: TENANT })
    : {
        success: false,
        message:
          "Drive OAuth no configurado: no se pueden bajar fotos de la carpeta restringida para Unidades Chile.",
      };

  const sheetOk = Boolean(sheetResult.success);
  const driveOk = Boolean(driveResult.success);
  const success = sheetOk && driveOk;
  const partial = !success && (sheetOk || driveOk);

  return {
    success,
    partial,
    tenant: TENANT,
    sheetSync: sheetResult,
    driveSync: driveResult,
    status: getAutoSyncStatus(),
    timestamp: new Date().toISOString(),
  };
}

/** Vercel Cron todos los días 12:00 UTC ≈ 9:00 Chile. Sin query string. */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await runUnidadesChileSync());
  } catch (err) {
    console.error("[CronSyncUc] Falló el sync diario:", err);
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
  return GET(req);
}
