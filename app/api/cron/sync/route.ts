import { NextRequest, NextResponse } from "next/server";
import { runAutoSync, getAutoSyncStatus } from "@/lib/server/autoSyncScheduler";
import {
  MAX_NEW_PHOTOS_PER_RUN,
  syncDrivePhotosViaOAuth,
} from "@/lib/server/driveOAuthSyncService";
import { isGoogleDriveOAuthConfigured } from "@/lib/server/googleDriveClient";
import { syncFromLiveGoogleSheet } from "@/lib/server/googleSheetSyncService";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";
import {
  buildCatalogSyncDetail,
  type CatalogSyncDetail,
  type DriveSyncSlice,
  type SheetSyncSlice,
} from "@/lib/server/catalogSyncDetail";
import { resolveCronTenant, type CronTenant } from "@/lib/server/cronTenant";
import { recordCatalogSyncState } from "@/lib/server/syncStateStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Hobby permite hasta 60s. El ritmo lo dispara GitHub Actions
 * (cada 30 min y a las 11:00, 12:00 y 22:00 UTC). Vercel ya no programa crons.
 */
export const maxDuration = 60;

/** Margen para escribir sync_state y responder antes del corte de 60s. */
const SYNC_BUDGET_MS = 50_000;

function authorizeCron(req: NextRequest): boolean {
  return authorizeMachineSecret(req, ["CRON_SECRET"], {
    allowQuerySecret: true,
    allowQueryInProd: process.env.CRON_ALLOW_QUERY_SECRET === "1",
    searchParams: req.nextUrl.searchParams,
    logLabel: "CronSync",
  });
}

async function runDailySync(
  tenantSlug: CronTenant,
  opts?: { only?: "sheet" | "drive" | "all"; deadlineAt?: number },
) {
  const only = opts?.only || "all";
  console.log("[CronSync] Ejecutando sincronización…", { only, tenantSlug });

  const sheetResult =
    only === "drive"
      ? {
          success: true,
          message: "Sheets omitido (only=drive).",
          updated: 0,
          rowsRead: 0,
          newVehicles: 0,
          updatedVehicles: 0,
          skippedIncomplete: 0,
        }
      : await syncFromLiveGoogleSheet(undefined, { tenantSlug });

  const driveResult =
    only === "sheet"
      ? {
          success: true,
          message: "Drive omitido (only=sheet).",
          newPhotosDownloaded: 0,
          syncedVehicles: 0,
          skippedUnchanged: 0,
          skippedCoverLocked: 0,
        }
      : tenantSlug === "unidades-chile"
        ? isGoogleDriveOAuthConfigured()
          ? await syncDrivePhotosViaOAuth({
              tenantSlug,
              maxNewPhotos: MAX_NEW_PHOTOS_PER_RUN,
              deadlineAt: opts?.deadlineAt,
            })
          : {
              success: false,
              message:
                "Drive OAuth no configurado: no se pueden bajar fotos de la carpeta restringida para Unidades Chile.",
            }
        : await runAutoSync({
            tenantSlug,
            maxNewPhotos: MAX_NEW_PHOTOS_PER_RUN,
            deadlineAt: opts?.deadlineAt,
          });

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

async function persistAndRespond(input: {
  tenant: CronTenant;
  started: number;
  result?: Awaited<ReturnType<typeof runDailySync>> | null;
  thrown?: string;
}) {
  const detail: CatalogSyncDetail = buildCatalogSyncDetail({
    tenant: input.tenant,
    sheet: (input.result?.sheetSync as SheetSyncSlice | undefined) ?? null,
    drive: (input.result?.driveSync as DriveSyncSlice | undefined) ?? null,
    durationMs: Date.now() - input.started,
    thrown: input.thrown,
  });
  let persisted: { ok: boolean; error?: string } = {
    ok: false,
    error: "no intentado",
  };
  try {
    persisted = await recordCatalogSyncState(input.tenant, detail);
  } catch (err) {
    persisted = {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo escribir sync_state",
    };
    console.error("[CronSync] sync_state falló:", persisted.error);
  }

  const status = input.thrown || !input.result?.success ? 500 : 200;
  return NextResponse.json(
    publicSyncBody(detail, soldFromSheet(input.result?.sheetSync), persisted),
    { status },
  );
}

/** Patente chilena (LLNNNN o LLLLNN), con o sin espacio. No toca "HTTP 404". */
const PLATE_IN_TEXT =
  /\b(?:[A-Za-z]{4}\s?[0-9]{2}|[A-Za-z]{2}\s?[0-9]{4})\b/g;

function redactPlates(message: string): string {
  return message.replace(PLATE_IN_TEXT, "[patente]");
}

/**
 * Cuerpo público del cron. Los logs de GitHub Actions son visibles para
 * cualquier sesión de GitHub: solo conteos, success y mensajes de error.
 * Nunca la ficha (patente, proveedor, precio lista, portada bloqueada).
 * Si un error nombra la carpeta de Drive, la patente se reemplaza.
 */
function publicSyncBody(
  detail: CatalogSyncDetail,
  sold: number,
  persisted: { ok: boolean; error?: string },
) {
  const errors = detail.errors
    .filter((err) => err.length > 0)
    .map(redactPlates);
  if (!persisted.ok && persisted.error) {
    const persistError = redactPlates(persisted.error);
    if (!errors.includes(persistError)) errors.push(persistError);
  }
  return {
    success: detail.success,
    tenant: detail.tenant,
    read: detail.read,
    inserted: detail.inserted,
    updated: detail.updated,
    sold,
    skipped: detail.skipped,
    errors,
  };
}

function soldFromSheet(sheet: unknown): number {
  if (!sheet || typeof sheet !== "object") return 0;
  const sold = (sheet as { soldVehicles?: unknown }).soldVehicles;
  return typeof sold === "number" && Number.isFinite(sold) ? sold : 0;
}

async function handleCronSync(req: NextRequest) {
  const started = Date.now();
  const resolved = resolveCronTenant(req.nextUrl.searchParams.get("tenant"));
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const onlyParam = req.nextUrl.searchParams.get("only");
  const only =
    onlyParam === "sheet" || onlyParam === "drive" ? onlyParam : "all";

  try {
    const result = await runDailySync(resolved.tenant, {
      only,
      deadlineAt: started + SYNC_BUDGET_MS,
    });
    return persistAndRespond({ tenant: resolved.tenant, started, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en sync";
    console.error("[CronSync] Falló el sync:", err);
    return persistAndRespond({
      tenant: resolved.tenant,
      started,
      thrown: message,
    });
  }
}

/**
 * GitHub Actions llama GET con Authorization: Bearer CRON_SECRET.
 * Sin `tenant`, 12:00 UTC → Unidades Chile y el resto → RG.
 * Con `?tenant=rg-motors|unidades-chile` se ignora la hora.
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

  return handleCronSync(req);
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return handleCronSync(req);
}
