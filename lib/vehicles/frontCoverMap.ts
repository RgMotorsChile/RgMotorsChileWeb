/**
 * Portada de vehículo: la elige el admin.
 * No se fuerza un “perfil delantero” por slug.
 * Las URLs de Google Drive DEBEN conservar `?id=` (sin eso la portada se pierde al sync).
 */

export const FRONT_COVER_BY_SLUG: Record<string, string> = {};

export function frontCoverUrl(_slug: string): string | null {
  return null;
}

export function withFrontCover<
  T extends { slug: string; image: string; gallery?: string[]; hasRealPhotos?: boolean },
>(vehicle: T): T {
  return vehicle;
}

export function driveFileId(url: string): string | null {
  const m = String(url || "").match(/[?&]id=([^&]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Normaliza URL de media sin romper thumbnails de Drive.
 * Blob/local: quita query de cache-bust.
 * Drive: reescribe a thumbnail canónico con id + sz.
 */
export function normalizeMediaUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;

  if (/drive\.google\.com/i.test(raw)) {
    const id = driveFileId(raw);
    if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    return raw;
  }

  return raw.split("?")[0];
}

export function mediaUrlsEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeMediaUrl(a);
  const nb = normalizeMediaUrl(b);
  if (na === nb) return true;
  const idA = driveFileId(na);
  const idB = driveFileId(nb);
  if (idA && idB) return idA === idB;
  return na.split("?")[0] === nb.split("?")[0];
}

/** Conserva la portada actual si sigue en la galería nueva (Drive/Blob). */
export function resolveCoverFromGallery(
  previousImage: string | undefined,
  gallery: string[],
): string {
  if (!gallery.length) return previousImage || "";
  if (!previousImage) return gallery[0];

  const matched = gallery.find((g) => mediaUrlsEqual(g, previousImage));
  if (matched) return matched;

  return gallery[0];
}

export function orderGalleryWithCover(cover: string, gallery: string[]): string[] {
  if (!cover) return gallery;
  const normalizedCover = normalizeMediaUrl(cover);
  const rest = gallery.filter((g) => !mediaUrlsEqual(g, normalizedCover));
  const coverInGallery = gallery.find((g) => mediaUrlsEqual(g, normalizedCover));
  return [coverInGallery || normalizedCover, ...rest];
}
