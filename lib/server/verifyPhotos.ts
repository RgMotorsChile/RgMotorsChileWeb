/**
 * Verifica que las fotos remotas (Vercel Blob) existan antes de renderizar la ficha.
 *
 * Causa raíz del "fotos en preparación" parpadeando: el catálogo guardaba URLs de Blob
 * que ya no existían (404). El HTML salía con la foto, el navegador recibía 404 y el
 * cliente la cambiaba por el placeholder: parpadeo + ficha sin fotos.
 *
 * Reglas:
 * - Solo se descarta una URL con respuesta definitiva (404/410/403).
 * - Timeouts o errores de red NO descartan (mejor intentar mostrar que ocultar fotos buenas).
 * - Rutas locales (/cars/...) se verifican contra VERCEL_URL; sin él se mantienen.
 * - Resultado cacheado en memoria 10 min por URL para no repetir HEADs en cada render ISR.
 */

const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 2500;
const cache = new Map<string, { ok: boolean; at: number }>();

const PLACEHOLDER_RE = /placeholder-pending|fotos-en-proceso/i;

export function isPlaceholderPhoto(src?: string | null): boolean {
  return !src || PLACEHOLDER_RE.test(src);
}

/** Rutas locales (/cars/...) se verifican contra el propio deployment si es posible. */
function absolutize(url: string): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  const host = process.env.VERCEL_URL?.trim();
  if (!host || !url.startsWith("/")) return null;
  return `https://${host}${url}`;
}

async function urlExists(original: string): Promise<boolean> {
  const url = absolutize(original);
  if (!url) return true;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let ok = true;
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal, cache: "no-store" });
    if (res.status === 404 || res.status === 410 || res.status === 403) ok = false;
  } catch {
    ok = true;
  } finally {
    clearTimeout(timer);
  }
  cache.set(url, { ok, at: Date.now() });
  return ok;
}

/** Devuelve la galería sin duplicados, sin placeholders y sin URLs rotas, portada primero. */
export async function verifiedGallery(image: string | undefined, gallery: string[] | undefined): Promise<string[]> {
  const candidates = [...new Set([image, ...(gallery || [])].filter((u): u is string => Boolean(u)))]
    .filter((u) => !isPlaceholderPhoto(u));
  if (candidates.length === 0) return [];
  const checks = await Promise.all(candidates.map(async (u) => [u, await urlExists(u)] as const));
  return checks.filter(([, ok]) => ok).map(([u]) => u);
}

/** Para la sincronización Drive→Blob: ¿el blob cacheado sigue existiendo? */
export async function blobStillExists(url: string): Promise<boolean> {
  cache.delete(url);
  return urlExists(url);
}
