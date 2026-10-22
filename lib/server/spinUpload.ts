/**
 * Giro 360 del admin.
 * 1. upload-urls firma cada fotograma en Supabase Storage.
 * 2. El navegador sube directo, sin pasar por Vercel.
 * 3. commit lista los archivos y solo entonces escribe catalog_vehicles.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Vehicle, VehicleSpin } from "@/lib/vehicles";
import { getVehicleBySlug, saveVehicle } from "@/lib/server/vehiclesStore";
import { deleteUnreferencedVehiclePhotos } from "@/lib/server/vehiclePhotoGc";
import { ensureVehiclePhotosBucket } from "@/lib/server/mediaStorage";
import {
  VEHICLE_PHOTOS_BUCKET,
  supabasePublicObjectUrl,
  vehiclePhotoObjectPath,
} from "@/lib/server/photoObjectPath";
import {
  RG_MOTORS_TENANT_SLUG,
  SUPABASE_URL,
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { isRetryableSpinFailure, spinRetryDelayMs } from "@/lib/spinRetry";

export const SPIN_SET_NAMES = ["m900", "d1600"] as const;
export const SPIN_EXTS = ["webp", "avif"] as const;
export const SPIN_FRAME_MIN = 24;
export const SPIN_FRAME_MAX = 200;
/** Tope por petición. 142+142 en una sola llamada no cabe en el límite de la función. */
export const SPIN_SIGN_BATCH_MAX = 48;
/** Una firma a la vez: cada URL firmada consulta el pool de la base. */
export const SPIN_SIGN_CONCURRENCY = 1;
export const SPIN_SIGN_ATTEMPTS = 4;
/** El slug ya validado no se vuelve a leer en cada lote. */
export const SPIN_VEHICLE_CACHE_MS = 10 * 60 * 1000;

export type SpinSetName = (typeof SPIN_SET_NAMES)[number];
export type SpinExt = (typeof SPIN_EXTS)[number];

export type SpinSetInput = {
  name: SpinSetName;
  ext: SpinExt;
  count: number;
  /** Inclusivo, desde 1. Si no viene, la petición firma el set completo. */
  from?: number;
  to?: number;
};

export type SpinUploadRequest = {
  slug: string;
  version: string;
  sets: SpinSetInput[];
};

export type SpinFolderEntry = { name: string; folder?: boolean };

export type SignedSpinUpload = {
  signedUrl: string;
  token: string;
  path: string;
};

export type SpinEndpointResult = {
  status: number;
  body: Record<string, unknown>;
};

type SaveResult = { success: boolean; vehicle?: Vehicle; error?: string };

export type SpinUploadDeps = {
  tenantSlug?: string;
  supabaseUrl?: string;
  findVehicle?: (slug: string) => Promise<Vehicle | null>;
  saveVehicle?: (vehicle: Vehicle) => Promise<SaveResult>;
  createSignedUploadUrl?: (path: string) => Promise<SignedSpinUpload>;
  listFolder?: (prefix: string) => Promise<SpinFolderEntry[]>;
  deleteUnreferenced?: typeof deleteUnreferencedVehiclePhotos;
  removeLocalSpin?: (slug: string) => Promise<void>;
  removeObjects?: (paths: string[]) => Promise<void>;
  /** 0 en tests. En producción, espera creciente si el pool de la base está lleno. */
  signRetryDelayMs?: number;
};

const SETS = new Set<string>(SPIN_SET_NAMES);
const EXTS = new Set<string>(SPIN_EXTS);

export function spinFrameFileName(index: number, ext: SpinExt): string {
  return `${String(index).padStart(3, "0")}.${ext}`;
}

export function spinSetPrefix(opts: {
  tenant: string;
  slug: string;
  version: string;
  set: SpinSetName;
}): string {
  return `${opts.tenant}/${opts.slug}/spin/${opts.version}/${opts.set}`;
}

/** Path dentro del bucket vehicle-photos. NNN empieza en 001. */
export function spinFrameObjectPath(opts: {
  tenant: string;
  slug: string;
  version: string;
  set: SpinSetName;
  index: number;
  ext: SpinExt;
}): string {
  const prefix = spinSetPrefix(opts);
  return `${prefix}/${spinFrameFileName(opts.index, opts.ext)}`;
}

export function spinPublicPattern(supabaseUrl: string, prefix: string, ext: SpinExt): string {
  return `${supabasePublicObjectUrl(supabaseUrl, prefix)}/{i}.${ext}`;
}

export function legacySpinPrefix(slug: string): string {
  return `cars/spin/${slug}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSpinUploadBody(
  body: unknown,
): { ok: true; value: SpinUploadRequest } | { ok: false; status: number; error: string } {
  if (!isRecord(body)) {
    return { ok: false, status: 400, error: "El cuerpo tiene que ser un objeto JSON." };
  }
  const slug = String(body.slug || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, status: 400, error: "Slug de vehículo no válido." };
  }
  const version = String(body.version || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(version)) {
    return { ok: false, status: 400, error: "Versión de giro no válida." };
  }
  if (!Array.isArray(body.sets) || body.sets.length < 1 || body.sets.length > 2) {
    return { ok: false, status: 400, error: "Indica el set m900 y, si hay HD, d1600." };
  }

  const sets: SpinSetInput[] = [];
  const seen = new Set<string>();
  for (const raw of body.sets) {
    if (!isRecord(raw)) {
      return { ok: false, status: 400, error: "Cada set tiene que traer name, ext y count." };
    }
    const name = String(raw.name || "").trim().toLowerCase();
    const ext = String(raw.ext || "").trim().toLowerCase();
    const count = raw.count;
    if (!SETS.has(name)) {
      return { ok: false, status: 400, error: "El set solo puede ser m900 o d1600." };
    }
    if (!EXTS.has(ext)) {
      return { ok: false, status: 400, error: "La extensión solo puede ser webp o avif." };
    }
    if (typeof count !== "number" || !Number.isInteger(count) || count < SPIN_FRAME_MIN || count > SPIN_FRAME_MAX) {
      return {
        ok: false,
        status: 400,
        error: `Cada set tiene que tener entre ${SPIN_FRAME_MIN} y ${SPIN_FRAME_MAX} fotogramas.`,
      };
    }
    const from = raw.from === undefined ? 1 : raw.from;
    const to = raw.to === undefined ? count : raw.to;
    if (typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) {
      return { ok: false, status: 400, error: "El rango del set tiene que ser de enteros." };
    }
    if (from < 1 || to > count || from > to) {
      return { ok: false, status: 400, error: "El rango del set se sale de la cantidad de fotogramas." };
    }
    if (seen.has(name)) {
      return { ok: false, status: 400, error: "El set viene repetido." };
    }
    seen.add(name);
    sets.push({ name: name as SpinSetName, ext: ext as SpinExt, count, from, to });
  }

  if (!seen.has("m900")) {
    return { ok: false, status: 400, error: "Falta el set estándar m900." };
  }
  const counts = new Set(sets.map((set) => set.count));
  if (counts.size > 1) {
    return { ok: false, status: 400, error: "La HD tiene que tener la misma cantidad de fotogramas que el estándar." };
  }

  return { ok: true, value: { slug, version, sets } };
}

function publicError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : fallback;
  if (/service_role|eyJ[a-zA-Z0-9_-]{20,}/.test(message)) return fallback;
  return message.slice(0, 300) || fallback;
}

function absoluteSignedUrl(signedUrl: string): string {
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const path = signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`;
  if (path.startsWith("/storage/")) return `${base}${path}`;
  return `${base}/storage/v1${path}`;
}

async function defaultFindVehicle(slug: string): Promise<Vehicle | null> {
  return lookupSpinVehicle(slug, (next) =>
    getVehicleBySlug(next, { bypassCache: true, scope: "staff" }),
  );
}

const spinVehicleCache = new Map<string, { vehicle: Vehicle; at: number }>();

export function clearSpinVehicleCache(): void {
  spinVehicleCache.clear();
}

/** La primera firma lee el catálogo. Los lotes siguientes reutilizan esa ficha. */
export async function lookupSpinVehicle(
  slug: string,
  load: (slug: string) => Promise<Vehicle | null>,
  now = Date.now(),
): Promise<Vehicle | null> {
  const hit = spinVehicleCache.get(slug);
  if (hit && now - hit.at < SPIN_VEHICLE_CACHE_MS) return hit.vehicle;
  const vehicle = await load(slug);
  if (vehicle) spinVehicleCache.set(slug, { vehicle, at: now });
  else spinVehicleCache.delete(slug);
  return vehicle;
}

let mimeReady: Promise<void> | null = null;

async function defaultSign(path: string): Promise<SignedSpinUpload> {
  if (!isSupabaseConfigured()) {
    const error = new Error("Falta SUPABASE_SERVICE_ROLE_KEY. El giro se guarda en Supabase Storage.");
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  mimeReady ??= ensureVehiclePhotosBucket().catch((err: unknown) => {
    mimeReady = null;
    throw err;
  });
  await mimeReady;
  const sb = createServerSupabase();
  const { data, error } = await sb.storage.from(VEHICLE_PHOTOS_BUCKET).createSignedUploadUrl(path, {
    upsert: true,
  });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "No se pudo firmar la subida.");
  }
  return {
    signedUrl: absoluteSignedUrl(data.signedUrl),
    token: data.token,
    path: data.path || path,
  };
}

async function defaultListFolder(prefix: string): Promise<SpinFolderEntry[]> {
  if (!isSupabaseConfigured()) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY. El giro se guarda en Supabase Storage.");
  }
  const folder = prefix.replace(/^\/+|\/+$/g, "");
  const sb = createServerSupabase();
  const entries: SpinFolderEntry[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const { data, error } = await sb.storage.from(VEHICLE_PHOTOS_BUCKET).list(folder, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      if (/not found|does not exist/i.test(error.message)) return entries;
      throw new Error(error.message || "No se pudo listar el giro.");
    }
    const rows = data ?? [];
    for (const item of rows) {
      if (!item?.name || item.name === ".emptyFolderPlaceholder") continue;
      entries.push({ name: item.name, folder: !item.id });
    }
    if (rows.length < pageSize) break;
  }
  return entries;
}

export async function removeLocalSpinDir(slug: string): Promise<void> {
  if (!/^[a-z0-9-]+$/i.test(slug)) return;
  const dir = join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "spin", slug);
  await rm(dir, { recursive: true, force: true });
}

function statusOf(err: unknown): number {
  if (typeof err === "object" && err && "status" in err && typeof (err as { status: unknown }).status === "number") {
    return (err as { status: number }).status;
  }
  return 500;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(message) as Error & { status?: number };
      error.status = 504;
      reject(error);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function signPathWithRetry(
  path: string,
  sign: (path: string) => Promise<SignedSpinUpload>,
  retryDelayMs: number,
): Promise<SignedSpinUpload> {
  let last: unknown;
  for (let attempt = 1; attempt <= SPIN_SIGN_ATTEMPTS; attempt += 1) {
    try {
      return await withTimeout(sign(path), 8_000, "Se agotó el tiempo al firmar una subida.");
    } catch (err) {
      last = err;
      const message = err instanceof Error ? err.message : "";
      const status = statusOf(err);
      const retryable = status === 504 || isRetryableSpinFailure(status === 500 ? undefined : status, message);
      if (!retryable || attempt === SPIN_SIGN_ATTEMPTS) throw err;
      const wait = spinRetryDelayMs(attempt, retryDelayMs);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw last;
}

export async function createSpinUploadUrls(
  body: unknown,
  deps: SpinUploadDeps = {},
): Promise<SpinEndpointResult> {
  const parsed = parseSpinUploadBody(body);
  if (!parsed.ok) return { status: parsed.status, body: { error: parsed.error } };

  const tenant = deps.tenantSlug || RG_MOTORS_TENANT_SLUG;
  const findVehicle = deps.findVehicle ?? defaultFindVehicle;
  const sign = deps.createSignedUploadUrl ?? defaultSign;
  const { slug, version, sets } = parsed.value;

  try {
    const vehicle = await findVehicle(slug);
    if (!vehicle) {
      return { status: 404, body: { error: `No existe el vehículo «${slug}».` } };
    }

    const planned = [];
    let framesToSign = 0;
    for (const set of sets) {
      framesToSign += (set.to ?? set.count) - (set.from ?? 1) + 1;
    }
    if (framesToSign > SPIN_SIGN_BATCH_MAX) {
      return {
        status: 400,
        body: {
          error: `Cada petición firma como máximo ${SPIN_SIGN_BATCH_MAX} fotogramas. Hay que pedirlos por lotes.`,
        },
      };
    }
    for (const set of sets) {
      const prefix = spinSetPrefix({ tenant, slug, version, set: set.name });
      const from = set.from ?? 1;
      const to = set.to ?? set.count;
      const indexes: number[] = [];
      for (let index = from; index <= to; index += 1) indexes.push(index);
      const paths = indexes.map((index) =>
        spinFrameObjectPath({
          tenant,
          slug,
          version,
          set: set.name,
          index,
          ext: set.ext,
        }),
      );
      if (paths.some((path) => !path.startsWith(`${prefix}/`) || path.includes(".."))) {
        return { status: 400, body: { error: "Ruta de giro inválida." } };
      }
      const signed: SignedSpinUpload[] = [];
      for (const path of paths) {
        signed.push(await signPathWithRetry(path, sign, deps.signRetryDelayMs ?? 200));
      }
      planned.push({
        name: set.name,
        ext: set.ext,
        count: set.count,
        from,
        to,
        prefix,
        uploads: signed.map((item, offset) => ({
          index: indexes[offset],
          fileName: spinFrameFileName(indexes[offset]!, set.ext),
          path: paths[offset],
          signedUrl: item.signedUrl,
          token: item.token,
          contentType: set.ext === "avif" ? "image/avif" : "image/webp",
        })),
      });
    }

    return {
      status: 200,
      body: {
        slug,
        version,
        tenant,
        bucket: VEHICLE_PHOTOS_BUCKET,
        sets: planned,
      },
    };
  } catch (err) {
    return { status: statusOf(err), body: { error: publicError(err, "No se pudo firmar la subida.") } };
  }
}

function expandPattern(pattern: string, count: number | undefined): string[] {
  if (!pattern.includes("{i}") && !pattern.includes("{index}")) return [pattern];
  const total = Math.min(Math.max(count || 0, 0), SPIN_FRAME_MAX);
  if (total === 0) return [];
  const frames: string[] = [];
  for (let i = 1; i <= total; i += 1) {
    const frame = String(i).padStart(3, "0");
    frames.push(pattern.replaceAll("{index}", frame).replaceAll("{i}", frame));
  }
  return frames;
}

export function spinVersionPrefixFromPattern(pattern: string | undefined): string | null {
  if (!pattern) return null;
  const sample = pattern.replaceAll("{i}", "001").replaceAll("{index}", "001");
  const objectPath = vehiclePhotoObjectPath(sample);
  if (!objectPath) return null;
  const match = objectPath.match(/^(.*\/spin\/[^/]+)\//);
  return match?.[1] ?? null;
}

async function listFilesRecursive(
  root: string,
  listFolder: (prefix: string) => Promise<SpinFolderEntry[]>,
): Promise<string[]> {
  const files: string[] = [];
  const pending = [root.replace(/\/+$/, "")];
  const seen = new Set<string>();
  while (pending.length > 0 && files.length < 5000 && seen.size < 200) {
    const prefix = pending.shift()!;
    if (!prefix || seen.has(prefix) || prefix.includes("..")) continue;
    seen.add(prefix);
    const entries = await listFolder(prefix);
    for (const entry of entries) {
      if (!entry.name || entry.name.includes("/") || entry.name === "." || entry.name === "..") continue;
      const path = `${prefix}/${entry.name}`;
      if (entry.folder) pending.push(path);
      else files.push(path);
    }
  }
  return files;
}

function presentNames(entries: SpinFolderEntry[]): Set<string> {
  const names = new Set<string>();
  for (const entry of entries) {
    if (entry.folder) continue;
    const base = entry.name.split("/").pop()?.toLowerCase();
    if (base) names.add(base);
  }
  return names;
}

export async function commitSpinUpload(
  body: unknown,
  deps: SpinUploadDeps = {},
): Promise<SpinEndpointResult> {
  const parsed = parseSpinUploadBody(body);
  if (!parsed.ok) return { status: parsed.status, body: { error: parsed.error } };

  const tenant = deps.tenantSlug || RG_MOTORS_TENANT_SLUG;
  const supabaseUrl = deps.supabaseUrl || SUPABASE_URL;
  const findVehicle = deps.findVehicle ?? defaultFindVehicle;
  const listFolder = deps.listFolder ?? defaultListFolder;
  const persist = deps.saveVehicle ?? saveVehicle;
  const deleteUnreferenced = deps.deleteUnreferenced ?? deleteUnreferencedVehiclePhotos;
  const removeLocal = deps.removeLocalSpin ?? removeLocalSpinDir;
  const { slug, version, sets } = parsed.value;

  const vehicle = await findVehicle(slug);
  if (!vehicle) {
    return { status: 404, body: { error: `No existe el vehículo «${slug}».` } };
  }

  const missing: string[] = [];
  try {
    for (const set of sets) {
      const prefix = spinSetPrefix({ tenant, slug, version, set: set.name });
      const entries = await listFolder(prefix);
      const present = presentNames(entries);
      for (let index = 1; index <= set.count; index += 1) {
        const fileName = spinFrameFileName(index, set.ext);
        if (!present.has(fileName)) missing.push(`${prefix}/${fileName}`);
      }
    }
  } catch (err) {
    return { status: 502, body: { error: publicError(err, "No se pudo listar el giro.") } };
  }

  if (missing.length > 0) {
    return {
      status: 409,
      body: {
        error: "Faltan fotogramas del giro. No se modificó el vehículo.",
        missing,
      },
    };
  }

  const standard = sets.find((set) => set.name === "m900")!;
  const hd = sets.find((set) => set.name === "d1600");
  const spin: VehicleSpin = {
    count: standard.count,
    front: 0,
    pattern: spinPublicPattern(
      supabaseUrl,
      spinSetPrefix({ tenant, slug, version, set: "m900" }),
      standard.ext,
    ),
  };
  if (hd) {
    spin.hiPattern = spinPublicPattern(
      supabaseUrl,
      spinSetPrefix({ tenant, slug, version, set: "d1600" }),
      hd.ext,
    );
  }

  const previous = vehicle.spin;
  const saved = await persist({ ...vehicle, spin });
  if (!saved.success) {
    return { status: 500, body: { error: saved.error || "No se pudo guardar el giro." } };
  }

  await cleanupReplacedSpin({
    slug,
    previous,
    supabaseUrl,
    listFolder,
    deleteUnreferenced,
    removeLocal,
  });

  return { status: 200, body: { success: true, spin } };
}

async function cleanupReplacedSpin(opts: {
  slug: string;
  previous?: VehicleSpin;
  supabaseUrl: string;
  listFolder: (prefix: string) => Promise<SpinFolderEntry[]>;
  deleteUnreferenced: typeof deleteUnreferencedVehiclePhotos;
  removeLocal: (slug: string) => Promise<void>;
}): Promise<void> {
  const urls = new Set<string>();
  for (const pattern of [opts.previous?.pattern, opts.previous?.hiPattern]) {
    if (!pattern) continue;
    for (const frame of expandPattern(pattern, opts.previous?.count)) urls.add(frame);
  }

  const prefixes = new Set<string>([legacySpinPrefix(opts.slug)]);
  const previousVersion =
    spinVersionPrefixFromPattern(opts.previous?.pattern) ||
    spinVersionPrefixFromPattern(opts.previous?.hiPattern);
  if (previousVersion) prefixes.add(previousVersion);

  try {
    for (const prefix of prefixes) {
      const files = await listFilesRecursive(prefix, opts.listFolder);
      for (const file of files) urls.add(supabasePublicObjectUrl(opts.supabaseUrl, file));
    }
  } catch (err) {
    console.warn("[spin/commit] no se pudo listar la versión anterior", publicError(err, "list"));
  }

  if (urls.size > 0) {
    try {
      await opts.deleteUnreferenced([...urls], "replaced");
    } catch (err) {
      console.warn("[spin/commit] no se pudo borrar la versión anterior", publicError(err, "delete"));
    }
  }

  try {
    await opts.removeLocal(opts.slug);
  } catch (err) {
    console.warn("[spin/commit] no se pudo borrar cars/spin local", publicError(err, "local"));
  }
}

export function spinVersionRoot(tenant: string, slug: string, version: string): string {
  return `${tenant}/${slug}/spin/${version}`;
}

function parseAbortBody(
  body: unknown,
): { ok: true; slug: string; version: string } | { ok: false; status: number; error: string } {
  if (!isRecord(body)) {
    return { ok: false, status: 400, error: "El cuerpo tiene que ser un objeto JSON." };
  }
  const slug = String(body.slug || "").trim().toLowerCase();
  const version = String(body.version || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, status: 400, error: "Slug de vehículo no válido." };
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(version)) {
    return { ok: false, status: 400, error: "Versión de giro no válida." };
  }
  return { ok: true, slug, version };
}

async function defaultRemoveObjects(paths: string[]): Promise<void> {
  if (!isSupabaseConfigured()) {
    const error = new Error("Falta SUPABASE_SERVICE_ROLE_KEY. El giro se guarda en Supabase Storage.");
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  const sb = createServerSupabase();
  for (let i = 0; i < paths.length; i += 100) {
    const slice = paths.slice(i, i + 100);
    const { error } = await sb.storage.from(VEHICLE_PHOTOS_BUCKET).remove(slice);
    if (error) throw new Error(error.message || "No se pudo borrar el intento.");
  }
}

/** Borra solo la versión de un intento que no llegó a publicarse. No toca la base. */
export async function abortSpinUpload(
  body: unknown,
  deps: SpinUploadDeps = {},
): Promise<SpinEndpointResult> {
  const parsed = parseAbortBody(body);
  if (!parsed.ok) return { status: parsed.status, body: { error: parsed.error } };

  const tenant = deps.tenantSlug || RG_MOTORS_TENANT_SLUG;
  const findVehicle = deps.findVehicle ?? defaultFindVehicle;
  const listFolder = deps.listFolder ?? defaultListFolder;
  const removeObjects = deps.removeObjects ?? defaultRemoveObjects;
  const { slug, version } = parsed;
  const root = spinVersionRoot(tenant, slug, version);
  if (!root.startsWith(`${tenant}/${slug}/spin/`) || root.includes("..")) {
    return { status: 400, body: { error: "Ruta de giro inválida." } };
  }

  try {
    const vehicle = await findVehicle(slug);
    if (!vehicle) {
      return { status: 404, body: { error: `No existe el vehículo «${slug}».` } };
    }
    const published = [vehicle.spin?.pattern, vehicle.spin?.hiPattern]
      .map((pattern) => spinVersionPrefixFromPattern(pattern))
      .filter((prefix): prefix is string => Boolean(prefix));
    if (published.includes(root)) {
      return { status: 409, body: { error: "Esa versión ya está publicada. No se borró." } };
    }

    const files = (await listFilesRecursive(root, listFolder)).filter(
      (path) => path.startsWith(`${root}/`) && !path.includes(".."),
    );
    if (files.length > 0) await removeObjects(files);
    return { status: 200, body: { success: true, deleted: files.length, version } };
  } catch (err) {
    return { status: statusOf(err), body: { error: publicError(err, "No se pudo borrar el intento.") } };
  }
}
