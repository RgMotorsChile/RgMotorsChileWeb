import { createHash } from "node:crypto";

/** Bucket público de fotos de vehículos. El resto de buckets no se toca. */
export const VEHICLE_PHOTOS_BUCKET = "vehicle-photos";

/**
 * Buckets de otros módulos. El borrado de fotos de autos rechaza cualquiera
 * de estos nombres, aunque alguien lo pase por error.
 */
export const PROTECTED_STORAGE_BUCKETS = [
  "boletas-receipts",
  "app-releases",
  "vehicle-notes",
  "box-evidence",
] as const;

export function assertDeletableVehiclePhotoBucket(bucket: string): void {
  if ((PROTECTED_STORAGE_BUCKETS as readonly string[]).includes(bucket)) {
    throw new Error(`Bucket protegido, no se borra: ${bucket}`);
  }
  if (bucket !== VEHICLE_PHOTOS_BUCKET) {
    throw new Error(`Solo se borran objetos de ${VEHICLE_PHOTOS_BUCKET}.`);
  }
}

/** SHA-256 del archivo ya convertido (JPEG/PNG/WebP). Igual contenido → mismo nombre. */
export function photoContentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** `{tenant}/{slug}/{sha256}.{ext}` dentro del bucket vehicle-photos. */
export function vehiclePhotoRelativePath(opts: {
  tenantSlug: string;
  slug: string;
  contentHash: string;
  ext: string;
}): string {
  const tenant = opts.tenantSlug.replace(/[^a-z0-9-]/gi, "") || "rg-motors";
  const slug = opts.slug.replace(/[^a-z0-9-]/gi, "") || "vehiculo";
  const ext = (opts.ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${tenant}/${slug}/${opts.contentHash}.${ext}`;
}

export function isSupabaseVehiclePhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".supabase.co") &&
      parsed.pathname.includes(`/storage/v1/object/public/${VEHICLE_PHOTOS_BUCKET}/`)
    );
  } catch {
    return false;
  }
}

export function isLegacyVercelBlobUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "blob.vercel-storage.com" || host.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Path interno del bucket, o null si la URL no es de vehicle-photos. */
export function vehiclePhotoObjectPath(url: string): string | null {
  if (!isSupabaseVehiclePhotoUrl(url)) return null;
  const parsed = new URL(url);
  const marker = `/storage/v1/object/public/${VEHICLE_PHOTOS_BUCKET}/`;
  const idx = parsed.pathname.indexOf(marker);
  if (idx < 0) return null;
  const path = decodeURIComponent(parsed.pathname.slice(idx + marker.length)).replace(/^\/+/, "");
  if (!path || path.includes("..")) return null;
  return path;
}

export function supabasePublicObjectUrl(supabaseUrl: string, relativePath: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const path = relativePath.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${VEHICLE_PHOTOS_BUCKET}/${path}`;
}
