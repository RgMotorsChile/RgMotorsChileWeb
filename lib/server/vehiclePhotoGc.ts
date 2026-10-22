/**
 * Borra fotos de vehicle-photos cuando ya no están referenciadas.
 * Si el borrado falla, queda una fila en public.vehicle_photo_orphans
 * (mismo esquema que UnidadesChile). El job diario las reintenta.
 */
import { createServerSupabase, isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/client";
import {
  VEHICLE_PHOTOS_BUCKET,
  assertDeletableVehiclePhotoBucket,
  supabasePublicObjectUrl,
  vehiclePhotoObjectPath,
} from "@/lib/server/photoObjectPath";

/** Margen para no borrar un archivo que se está subiendo y todavía no está en la base. */
export const ORPHAN_MIN_AGE_MS = 15 * 60 * 1000;

export const ORPHAN_TABLE = "vehicle_photo_orphans";

/** Valores permitidos por el check de public.vehicle_photo_orphans. */
export type PhotoDeleteReason = "sold" | "deleted" | "removed" | "replaced";

export type StorageObjectInfo = { name: string; createdAt: string | null };

export type VehiclePhotoOrphan = {
  bucket: string;
  object_path: string;
  tenant_slug: string;
  vehicle_slug: string;
  public_url: string;
  reason: PhotoDeleteReason;
  error: string;
  purged_at: string | null;
};

export type PhotoGcDeps = {
  isReferenced?: (objectPath: string) => Promise<boolean>;
  removeObjects?: (paths: string[]) => Promise<void>;
  listPrefix?: (prefix: string) => Promise<string[]>;
  listObjects?: () => Promise<StorageObjectInfo[]>;
  loadReferencedPaths?: () => Promise<Set<string>>;
  loadPendingOrphans?: () => Promise<VehiclePhotoOrphan[]>;
  upsertOrphans?: (rows: VehiclePhotoOrphan[]) => Promise<void>;
  markPurged?: (objectPaths: string[]) => Promise<void>;
  now?: () => number;
};

export function selectOrphanPhotoPaths(opts: {
  objects: StorageObjectInfo[];
  referencedPaths: Set<string>;
  now?: number;
  minAgeMs?: number;
}): string[] {
  const now = opts.now ?? Date.now();
  const minAge = opts.minAgeMs ?? ORPHAN_MIN_AGE_MS;
  const out: string[] = [];
  for (const obj of opts.objects) {
    const name = String(obj.name || "").replace(/^\/+/, "");
    if (!name || name.includes("..") || name.endsWith("/")) continue;
    if (opts.referencedPaths.has(name)) continue;
    const created = obj.createdAt ? Date.parse(obj.createdAt) : Number.NaN;
    if (!Number.isFinite(created)) continue;
    if (now - created < minAge) continue;
    out.push(name);
  }
  return out;
}

export function tenantAndSlugFromPath(objectPath: string): { tenantSlug: string; vehicleSlug: string } {
  const clean = objectPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const [tenantSlug = "", vehicleSlug = ""] = clean.split("/");
  return { tenantSlug, vehicleSlug };
}

export function orphanRow(opts: {
  objectPath: string;
  reason: PhotoDeleteReason;
  error?: string;
  purgedAt?: string | null;
  tenantSlug?: string;
  vehicleSlug?: string;
}): VehiclePhotoOrphan {
  const parsed = tenantAndSlugFromPath(opts.objectPath);
  const objectPath = opts.objectPath.replace(/^\/+/, "");
  const tenantSlug = opts.tenantSlug || parsed.tenantSlug || "rg-motors";
  const vehicleSlug = opts.vehicleSlug ?? parsed.vehicleSlug;
  return {
    bucket: VEHICLE_PHOTOS_BUCKET,
    object_path: objectPath,
    tenant_slug: tenantSlug,
    vehicle_slug: vehicleSlug,
    public_url: objectPath.endsWith("/") ? "" : supabasePublicObjectUrl(SUPABASE_URL, objectPath),
    reason: opts.reason,
    error: String(opts.error || "").slice(0, 500),
    purged_at: opts.purgedAt ?? null,
  };
}

function uniquePaths(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const path = vehiclePhotoObjectPath(url);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

function isAlreadyGone(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /not found|does not exist|no such/i.test(message);
}

async function defaultIsReferenced(objectPath: string): Promise<boolean> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("vehicle_photo_is_referenced", {
    object_path: objectPath.replace(/\/+$/, ""),
  });
  if (error) {
    console.warn("[PhotoGc] No se pudo verificar la referencia; no se borra:", error.message);
    return true;
  }
  return Boolean(data);
}

async function defaultRemove(paths: string[]): Promise<void> {
  assertDeletableVehiclePhotoBucket(VEHICLE_PHOTOS_BUCKET);
  const sb = createServerSupabase();
  const { error } = await sb.storage.from(VEHICLE_PHOTOS_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

async function defaultListPrefix(prefix: string): Promise<string[]> {
  assertDeletableVehiclePhotoBucket(VEHICLE_PHOTOS_BUCKET);
  const folder = prefix.replace(/\/+$/, "").replace(/^\/+/, "");
  const sb = createServerSupabase();
  const paths: string[] = [];
  const page = 1000;
  for (let offset = 0; offset < 20000; offset += page) {
    const { data, error } = await sb.storage.from(VEHICLE_PHOTOS_BUCKET).list(folder, {
      limit: page,
      offset,
    });
    if (error) throw new Error(error.message || "No se pudo listar las fotos.");
    const rows = data || [];
    for (const item of rows) {
      if (!item?.name || item.name === ".emptyFolderPlaceholder") continue;
      if (!item.id) continue;
      paths.push(`${folder}/${item.name}`);
    }
    if (rows.length < page) break;
  }
  return paths;
}

async function defaultUpsert(rows: VehiclePhotoOrphan[]): Promise<void> {
  if (rows.length === 0) return;
  assertDeletableVehiclePhotoBucket(rows[0]?.bucket || VEHICLE_PHOTOS_BUCKET);
  for (const row of rows) assertDeletableVehiclePhotoBucket(row.bucket);
  const sb = createServerSupabase();
  const { error } = await sb.from(ORPHAN_TABLE).upsert(rows, { onConflict: "bucket,object_path" });
  if (error) throw new Error(error.message);
}

async function defaultMarkPurged(objectPaths: string[]): Promise<void> {
  if (objectPaths.length === 0) return;
  const sb = createServerSupabase();
  const { error } = await sb
    .from(ORPHAN_TABLE)
    .update({ purged_at: new Date().toISOString() })
    .eq("bucket", VEHICLE_PHOTOS_BUCKET)
    .in("object_path", objectPaths)
    .is("purged_at", null);
  if (error) throw new Error(error.message);
}

async function defaultPending(): Promise<VehiclePhotoOrphan[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from(ORPHAN_TABLE)
    .select("bucket,object_path,tenant_slug,vehicle_slug,public_url,reason,error,purged_at")
    .eq("bucket", VEHICLE_PHOTOS_BUCKET)
    .is("purged_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as VehiclePhotoOrphan[];
}

async function recordFailures(
  failures: Array<{ path: string; error: string }>,
  reason: PhotoDeleteReason,
  deps?: PhotoGcDeps,
): Promise<void> {
  if (failures.length === 0) return;
  const upsert = deps?.upsertOrphans ?? defaultUpsert;
  await upsert(failures.map((failure) => orphanRow({
    objectPath: failure.path,
    reason,
    error: failure.error,
    purgedAt: null,
  })));
}

/**
 * Borra objetos de vehicle-photos que ya no aparecen en catalog_vehicles.
 * URLs de Blob o de otro bucket se ignoran.
 * Si Storage no borra, inserta public.vehicle_photo_orphans y no lanza.
 */
export async function deleteUnreferencedVehiclePhotos(
  urls: string[],
  reason: PhotoDeleteReason,
  deps?: PhotoGcDeps,
): Promise<{ deleted: string[]; kept: string[]; orphans: string[] }> {
  const paths = uniquePaths(urls);
  if (paths.length === 0) return { deleted: [], kept: [], orphans: [] };
  if (!deps && !isSupabaseConfigured()) return { deleted: [], kept: paths, orphans: [] };

  assertDeletableVehiclePhotoBucket(VEHICLE_PHOTOS_BUCKET);
  const isReferenced = deps?.isReferenced ?? defaultIsReferenced;
  const removeObjects = deps?.removeObjects ?? defaultRemove;
  const deleted: string[] = [];
  const kept: string[] = [];
  const failures: Array<{ path: string; error: string }> = [];

  for (const objectPath of paths) {
    let referenced = true;
    try {
      referenced = await isReferenced(objectPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo verificar la referencia.";
      failures.push({ path: objectPath, error: message });
      kept.push(objectPath);
      continue;
    }
    if (referenced) {
      kept.push(objectPath);
      continue;
    }
    try {
      await removeObjects([objectPath]);
      deleted.push(objectPath);
    } catch (err) {
      if (isAlreadyGone(err)) {
        deleted.push(objectPath);
        continue;
      }
      const message = err instanceof Error ? err.message : "No se pudo borrar la foto.";
      console.warn("[PhotoGc] No se pudo borrar", objectPath, message);
      failures.push({ path: objectPath, error: message });
      kept.push(objectPath);
    }
  }

  const orphans: string[] = [];
  if (failures.length > 0) {
    try {
      await recordFailures(failures, reason, deps);
      orphans.push(...failures.map((failure) => failure.path));
    } catch (err) {
      console.error("[PhotoGc] huérfanos sin registrar", err);
    }
  }
  return { deleted, kept, orphans };
}

function expandSpinFrames(pattern: string, count: number | undefined): string[] {
  if (!pattern.includes("{i}") && !pattern.includes("{index}")) return [pattern];
  const total = Math.min(Math.max(count || 0, 0), 360);
  if (total === 0) return [pattern];
  const frames: string[] = [];
  for (let i = 1; i <= total; i += 1) {
    const frame = String(i).padStart(3, "0");
    frames.push(pattern.replaceAll("{index}", frame).replaceAll("{i}", frame));
  }
  return frames;
}

function collectPhotoUrls(vehicle: {
  image?: string;
  gallery?: string[];
  spin?: { pattern?: string; hiPattern?: string; count?: number };
}): string[] {
  const urls = new Set<string>();
  if (vehicle.image) urls.add(vehicle.image);
  for (const url of vehicle.gallery || []) {
    if (url) urls.add(url);
  }
  for (const pattern of [vehicle.spin?.pattern, vehicle.spin?.hiPattern]) {
    if (!pattern) continue;
    for (const frame of expandSpinFrames(pattern, vehicle.spin?.count)) {
      urls.add(frame);
    }
  }
  return [...urls];
}

/** Tras vender o borrar el auto en la base: suelta sus fotos si nadie más las cita. */
export async function releaseVehiclePhotos(
  vehicle: { image?: string; gallery?: string[]; spin?: { pattern?: string; hiPattern?: string; count?: number } },
  reason: Extract<PhotoDeleteReason, "sold" | "deleted">,
  deps?: PhotoGcDeps,
): Promise<{ deleted: string[]; kept: string[]; orphans: string[] }> {
  return deleteUnreferencedVehiclePhotos(collectPhotoUrls(vehicle), reason, deps);
}

async function defaultListObjects(): Promise<StorageObjectInfo[]> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("list_vehicle_photo_objects");
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: { name?: string; created_at?: string | null }) => ({
    name: String(row.name || ""),
    createdAt: row.created_at ?? null,
  }));
}

async function defaultReferencedPaths(): Promise<Set<string>> {
  const sb = createServerSupabase();
  const paths = new Set<string>();
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("catalog_vehicles")
      .select("image,gallery,spin")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const urls = collectPhotoUrls({
        image: typeof row.image === "string" ? row.image : undefined,
        gallery: Array.isArray(row.gallery) ? (row.gallery as string[]) : undefined,
        spin:
          row.spin && typeof row.spin === "object"
            ? (row.spin as { pattern?: string; hiPattern?: string; count?: number })
            : undefined,
      });
      for (const url of urls) {
        const path = vehiclePhotoObjectPath(url);
        if (path) paths.add(path);
      }
    }
    if (rows.length < page) break;
  }
  return paths;
}

export type OrphanCleanupResult = {
  dryRun: boolean;
  deleted: string[];
  purged: string[];
  recorded: string[];
};

/**
 * Job diario.
 * 1. Reintenta public.vehicle_photo_orphans con purged_at null
 *    (incluye prefijos tenant/slug/ que dejó Unidades Chile si no pudo listar).
 * 2. Borra huérfanos del bucket con más de unos minutos, como red de seguridad.
 * Nunca opera fuera de vehicle-photos.
 */
export async function runVehiclePhotoOrphanCleanup(opts?: {
  dryRun?: boolean;
  deps?: PhotoGcDeps;
}): Promise<OrphanCleanupResult> {
  const dryRun = opts?.dryRun === true;
  if (!opts?.deps && !isSupabaseConfigured()) {
    return { dryRun, deleted: [], purged: [], recorded: [] };
  }
  assertDeletableVehiclePhotoBucket(VEHICLE_PHOTOS_BUCKET);
  const deps = opts?.deps;
  const isReferenced = deps?.isReferenced ?? defaultIsReferenced;
  const removeObjects = deps?.removeObjects ?? defaultRemove;
  const listPrefix = deps?.listPrefix ?? defaultListPrefix;
  const listObjects = deps?.listObjects ?? defaultListObjects;
  const loadReferencedPaths = deps?.loadReferencedPaths ?? defaultReferencedPaths;
  const loadPending = deps?.loadPendingOrphans ?? defaultPending;
  const upsertOrphans = deps?.upsertOrphans ?? defaultUpsert;
  const markPurged = deps?.markPurged ?? defaultMarkPurged;
  const now = deps?.now?.() ?? Date.now();

  const deleted: string[] = [];
  const purged: string[] = [];
  const recorded: string[] = [];
  const pending = await loadPending();

  for (const row of pending) {
    if (row.bucket !== VEHICLE_PHOTOS_BUCKET) continue;
    assertDeletableVehiclePhotoBucket(row.bucket);
    const raw = String(row.object_path || "");
    let targets: string[] = [];
    if (raw.endsWith("/")) {
      try {
        targets = await listPrefix(raw);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo listar el prefijo.";
        if (!dryRun) {
          await upsertOrphans([orphanRow({
            objectPath: raw,
            reason: row.reason,
            error: message,
            tenantSlug: row.tenant_slug,
            vehicleSlug: row.vehicle_slug,
          })]).catch((logErr) => console.warn("[PhotoGc] no se actualizó el huérfano", logErr));
        }
        continue;
      }
    } else {
      targets = [raw.replace(/^\/+/, "")];
    }

    const removable: string[] = [];
    for (const path of targets) {
      const referenced = await isReferenced(path);
      if (!referenced) removable.push(path);
    }

    if (dryRun) {
      deleted.push(...removable);
      continue;
    }

    if (removable.length > 0) {
      try {
        await removeObjects(removable);
        deleted.push(...removable);
      } catch (err) {
        if (!isAlreadyGone(err)) {
          const message = err instanceof Error ? err.message : "No se pudo borrar la foto.";
          const failures = removable.map((path) => orphanRow({
            objectPath: path,
            reason: row.reason,
            error: message,
            tenantSlug: row.tenant_slug,
            vehicleSlug: path === raw ? row.vehicle_slug : tenantAndSlugFromPath(path).vehicleSlug,
          }));
          await upsertOrphans(failures).catch((logErr) => console.warn("[PhotoGc]", logErr));
          recorded.push(...removable);
          if (!raw.endsWith("/")) continue;
        }
      }
    }

    await markPurged([raw]).catch((err) => console.warn("[PhotoGc] purged_at", err));
    purged.push(raw);
  }

  const [objects, referencedPaths] = await Promise.all([
    listObjects(),
    loadReferencedPaths(),
  ]);
  const pendingPaths = new Set(pending.map((row) => row.object_path));
  const scanned = selectOrphanPhotoPaths({ objects, referencedPaths, now }).filter(
    (path) => !pendingPaths.has(path),
  );

  if (dryRun) {
    return { dryRun, deleted: [...deleted, ...scanned], purged, recorded };
  }

  for (const path of scanned) {
    try {
      await removeObjects([path]);
      deleted.push(path);
      await upsertOrphans([
        orphanRow({
          objectPath: path,
          reason: "removed",
          error: "",
          purgedAt: new Date(now).toISOString(),
        }),
      ]);
      purged.push(path);
    } catch (err) {
      if (isAlreadyGone(err)) {
        purged.push(path);
        continue;
      }
      const message = err instanceof Error ? err.message : "No se pudo borrar el huérfano.";
      await upsertOrphans([orphanRow({ objectPath: path, reason: "removed", error: message })]).catch(
        (logErr) => console.warn("[PhotoGc]", logErr),
      );
      recorded.push(path);
    }
  }

  return { dryRun, deleted, purged, recorded };
}
