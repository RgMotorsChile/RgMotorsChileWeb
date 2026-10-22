/**
 * Un lote del re-sync Drive → Supabase. Lo usa /api/cron/photos-resync
 * (producción, secretos de Vercel) y el script local.
 * Idempotente: el nombre es el hash y una URL que ya no es de Blob no se vuelve a bajar.
 */
import { isLegacyVercelBlobUrl } from "@/lib/server/photoObjectPath";
import {
  loadDrivePhotosSyncState,
  syncDrivePhotosViaOAuth,
  type DrivePhotosSyncState,
  type SyncResult,
} from "@/lib/server/driveOAuthSyncService";
import { getVehicles } from "@/lib/server/vehiclesStore";
import type { CronTenant } from "@/lib/server/cronTenant";
import type { Vehicle } from "@/lib/vehicles";

export const PHOTOS_RESYNC_TENANTS = ["rg-motors", "unidades-chile"] as const;
export const PHOTOS_RESYNC_DEFAULT_LIMIT = 4;
export const PHOTOS_RESYNC_MAX_LIMIT = 8;
/** Margen bajo el maxDuration de 60s de Hobby. */
export const PHOTOS_RESYNC_BUDGET_MS = 50_000;

export type PhotosResyncCursor = {
  tenant: CronTenant;
  /** Slug ya intentado. El siguiente lote empieza después de este. */
  afterSlug: string;
};

export type PhotosResyncBatch = {
  ok: boolean;
  done: boolean;
  tenant: CronTenant;
  cursor: string;
  nextCursor: string | null;
  limit: number;
  pending: number;
  batch: string[];
  syncedVehicles: number;
  newPhotosDownloaded: number;
  deferredVehicles: number;
  message: string;
};

type VehicleSlice = Pick<Vehicle, "slug" | "image" | "gallery">;

function isTenant(value: string): value is CronTenant {
  return value === "rg-motors" || value === "unidades-chile";
}

export function encodePhotosResyncCursor(cursor: PhotosResyncCursor): string {
  if (!cursor.afterSlug) return cursor.tenant;
  return `${cursor.tenant}:${cursor.afterSlug}`;
}

export function parsePhotosResyncCursor(
  raw: string | null | undefined,
): { ok: true; cursor: PhotosResyncCursor } | { ok: false; error: string } {
  const text = raw?.trim() || "rg-motors";
  const colon = text.indexOf(":");
  const tenantPart = colon === -1 ? text : text.slice(0, colon);
  const afterSlug = colon === -1 ? "" : text.slice(colon + 1);
  if (!isTenant(tenantPart)) {
    return { ok: false, error: "Cursor inválido. Usá rg-motors o unidades-chile." };
  }
  if (afterSlug && !/^[a-z0-9-]+$/i.test(afterSlug)) {
    return { ok: false, error: "El slug del cursor no es válido." };
  }
  return { ok: true, cursor: { tenant: tenantPart, afterSlug } };
}

export function parsePhotosResyncLimit(
  raw: string | null | undefined,
): { ok: true; limit: number } | { ok: false; error: string } {
  if (!raw?.trim()) return { ok: true, limit: PHOTOS_RESYNC_DEFAULT_LIMIT };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > PHOTOS_RESYNC_MAX_LIMIT) {
    return {
      ok: false,
      error: `limit tiene que ser un entero entre 1 y ${PHOTOS_RESYNC_MAX_LIMIT}.`,
    };
  }
  return { ok: true, limit };
}

export function parsePhotosResyncRequest(opts: {
  cursor?: string | null;
  tenant?: string | null;
  limit?: string | null;
}): { ok: true; cursor: PhotosResyncCursor; limit: number } | { ok: false; error: string } {
  const parsedCursor = parsePhotosResyncCursor(opts.cursor);
  if (!parsedCursor.ok) return parsedCursor;
  const tenant = opts.tenant?.trim() || "";
  if (tenant) {
    if (!isTenant(tenant)) {
      return { ok: false, error: "Tenant inválido. Usá rg-motors o unidades-chile." };
    }
    if (opts.cursor?.trim() && tenant !== parsedCursor.cursor.tenant) {
      return { ok: false, error: "tenant y cursor no coinciden." };
    }
    if (!opts.cursor?.trim()) {
      parsedCursor.cursor = { tenant, afterSlug: "" };
    }
  }
  const parsedLimit = parsePhotosResyncLimit(opts.limit);
  if (!parsedLimit.ok) return parsedLimit;
  return { ok: true, cursor: parsedCursor.cursor, limit: parsedLimit.limit };
}

function storedUrls(vehicle: VehicleSlice): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url?: string) => {
    const clean = url?.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };
  push(vehicle.image);
  for (const url of vehicle.gallery || []) push(url);
  return out;
}

function manualBlobUrls(state: DrivePhotosSyncState): Set<string> {
  const urls = new Set<string>();
  for (const file of Object.values(state.files || {})) {
    if (!file?.manualReplacedAt || !file.blobUrl) continue;
    urls.add(file.blobUrl.split("?")[0]);
  }
  return urls;
}

/** Autos que todavía tienen una URL de Vercel Blob que el sync puede reemplazar. */
export function selectResyncSlugs(opts: {
  vehicles: VehicleSlice[];
  manualBlobUrls: Set<string>;
  afterSlug: string;
  limit: number;
}): { pending: number; slugs: string[] } {
  const pending = opts.vehicles
    .filter((vehicle) => {
      if (opts.afterSlug && vehicle.slug.localeCompare(opts.afterSlug) <= 0) return false;
      return storedUrls(vehicle).some((url) => {
        if (!isLegacyVercelBlobUrl(url)) return false;
        return !opts.manualBlobUrls.has(url.split("?")[0]);
      });
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    pending: pending.length,
    slugs: pending.slice(0, opts.limit).map((vehicle) => vehicle.slug),
  };
}

function emptyBatch(
  cursor: PhotosResyncCursor,
  limit: number,
  message: string,
  done: boolean,
  nextCursor: string | null,
): PhotosResyncBatch {
  return {
    ok: true,
    done,
    tenant: cursor.tenant,
    cursor: encodePhotosResyncCursor(cursor),
    nextCursor,
    limit,
    pending: 0,
    batch: [],
    syncedVehicles: 0,
    newPhotosDownloaded: 0,
    deferredVehicles: 0,
    message,
  };
}

function nextTenantCursor(
  tenant: CronTenant,
  stopAfterTenant?: CronTenant,
): PhotosResyncCursor | null {
  if (stopAfterTenant) return null;
  if (tenant === "rg-motors") return { tenant: "unidades-chile", afterSlug: "" };
  return null;
}

export async function runPhotosResyncBatch(opts?: {
  cursor?: string | null;
  tenant?: string | null;
  limit?: number;
  deadlineAt?: number;
  /** El script local puede pedir un solo tenant. */
  stopAfterTenant?: CronTenant;
  sync?: typeof syncDrivePhotosViaOAuth;
  loadState?: typeof loadDrivePhotosSyncState;
  listVehicles?: typeof getVehicles;
}): Promise<PhotosResyncBatch> {
  const parsed = parsePhotosResyncRequest({
    cursor: opts?.cursor,
    tenant: opts?.tenant,
    limit: opts?.limit ? String(opts.limit) : null,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      done: false,
      tenant: "rg-motors",
      cursor: opts?.cursor?.trim() || "rg-motors",
      nextCursor: opts?.cursor?.trim() || "rg-motors",
      limit: PHOTOS_RESYNC_DEFAULT_LIMIT,
      pending: 0,
      batch: [],
      syncedVehicles: 0,
      newPhotosDownloaded: 0,
      deferredVehicles: 0,
      message: parsed.error,
    };
  }

  const cursor = parsed.cursor;
  const limit = parsed.limit;
  const listVehicles = opts?.listVehicles ?? getVehicles;
  const loadState = opts?.loadState ?? loadDrivePhotosSyncState;
  const sync = opts?.sync ?? syncDrivePhotosViaOAuth;
  const [vehicles, state] = await Promise.all([
    listVehicles({ tenantSlug: cursor.tenant, bypassCache: true, scope: "staff" }),
    loadState(cursor.tenant),
  ]);
  const selected = selectResyncSlugs({
    vehicles,
    manualBlobUrls: manualBlobUrls(state),
    afterSlug: cursor.afterSlug,
    limit,
  });

  if (selected.slugs.length === 0) {
    const left = selectResyncSlugs({
      vehicles,
      manualBlobUrls: manualBlobUrls(state),
      afterSlug: "",
      limit: 1,
    }).pending;
    const following = nextTenantCursor(cursor.tenant, opts?.stopAfterTenant);
    const message = left
      ? `${cursor.tenant}: quedan ${left} auto(s) con URL de Blob que no se migraron (reemplazo manual o sin carpeta en Drive).`
      : following
        ? `${cursor.tenant} no tiene URLs de Blob pendientes.`
        : "Re-sync terminado. No quedan URLs de Vercel Blob por migrar.";
    const batch = emptyBatch(
      cursor,
      limit,
      message,
      !following,
      following ? encodePhotosResyncCursor(following) : null,
    );
    return { ...batch, pending: left };
  }

  let result: SyncResult;
  try {
    result = await sync({
      tenantSlug: cursor.tenant,
      migrateBlobUrls: true,
      maxBlobHeadChecks: 0,
      onlySlugs: selected.slugs,
      maxVehicles: selected.slugs.length,
      maxNewPhotos: Math.min(36, limit * 12),
      photosPerVehicle: 12,
      maxFolderLists: Math.min(30, limit * 2),
      deadlineAt: opts?.deadlineAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falló el re-sync.";
    return {
      ok: false,
      done: false,
      tenant: cursor.tenant,
      cursor: encodePhotosResyncCursor(cursor),
      nextCursor: encodePhotosResyncCursor(cursor),
      limit,
      pending: selected.pending,
      batch: selected.slugs,
      syncedVehicles: 0,
      newPhotosDownloaded: 0,
      deferredVehicles: 0,
      message,
    };
  }

  const deferred = result.deferredVehicles || 0;
  const downloaded = result.newPhotosDownloaded || 0;
  const advance = result.success && deferred === 0;
  const next: PhotosResyncCursor = advance
    ? { tenant: cursor.tenant, afterSlug: selected.slugs[selected.slugs.length - 1] || cursor.afterSlug }
    : cursor;
  return {
    ok: result.success,
    done: false,
    tenant: cursor.tenant,
    cursor: encodePhotosResyncCursor(cursor),
    nextCursor: encodePhotosResyncCursor(next),
    limit,
    pending: selected.pending,
    batch: selected.slugs,
    syncedVehicles: result.syncedVehicles || 0,
    newPhotosDownloaded: downloaded,
    deferredVehicles: deferred,
    message: result.message,
  };
}
