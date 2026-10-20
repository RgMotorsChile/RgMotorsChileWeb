/**
 * Reemplazo manual de una foto (admin → "Reemplazar foto").
 *
 * La foto nueva se sube a una ruta nueva `<stem>__r<epoch>.<ext>` (no se
 * sobrescribe el blob viejo: el CDN y los navegadores lo tienen en caché) y
 * se cambia la URL en la misma posición de la galería y en la portada.
 * El sync de Drive reconoce el sufijo `__r<n>` como el mismo archivo de Drive
 * (ver fileIdFromStoredUrl) y además el caché queda marcado manualReplacedAt,
 * así no vuelve a poner la foto original.
 */

export const REPLACE_MAX_BYTES = 3_200_000;
const ALLOWED_EXT = /^(jpe?g|png|webp|avif|heic|heif)$/i;
const ALLOWED_MIME = /^image\/(jpeg|jpg|png|webp|avif|heic|heif)$/i;

/** Sufijo de reemplazo manual: foo__r1729450000000.jpg → foo */
export const REPLACED_SUFFIX = /__r\d+$/;

export function stripReplacedSuffix(stem: string): string {
  return stem.replace(REPLACED_SUFFIX, "");
}

export function storedStem(url: string): string {
  const base = String(url || "").split("?")[0].split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function validateReplacementFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!file.size || file.size < 32) return `«${file.name || "archivo"}» está vacío o corrupto.`;
  if (file.size > REPLACE_MAX_BYTES) {
    return `«${file.name}» pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo ~${(REPLACE_MAX_BYTES / 1024 / 1024).toFixed(1)} MB por foto.`;
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const extOk = ALLOWED_EXT.test(ext);
  const mimeOk = !file.type || ALLOWED_MIME.test(file.type) || file.type === "application/octet-stream";
  if (!extOk || !mimeOk) {
    return `«${file.name}» no es una imagen permitida (JPG, PNG, WebP o HEIC).`;
  }
  return null;
}

/** Ruta Blob nueva para el reemplazo, en la carpeta del auto. */
export function buildReplacementPath(
  slug: string,
  oldUrl: string,
  ext: string,
  now = Date.now(),
): string {
  const stem = stripReplacedSuffix(storedStem(oldUrl)).replace(/[^A-Za-z0-9_.-]/g, "") || "foto";
  const safeExt = (ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `cars/uploads/${slug}/${stem}__r${now}.${safeExt}`;
}

function sameUrl(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.split("?")[0] === b.split("?")[0];
}

/**
 * Cambia oldUrl por newUrl manteniendo posición y portada.
 * Devuelve null si oldUrl no es foto de este auto.
 */
export function swapPhotoUrl<T extends { image?: string; gallery?: string[] }>(
  vehicle: T,
  oldUrl: string,
  newUrl: string,
): { image: string | undefined; gallery: string[] } | null {
  const gallery = Array.isArray(vehicle.gallery) ? [...vehicle.gallery] : [];
  const idx = gallery.findIndex((u) => sameUrl(u, oldUrl));
  const isCover = sameUrl(vehicle.image, oldUrl);
  if (idx < 0 && !isCover) return null;
  if (idx >= 0) gallery[idx] = newUrl;
  return { image: isCover ? newUrl : vehicle.image, gallery };
}
