/**
 * HEIC/HEIF/DNG no se pueden publicar tal cual. Drive ya los renderiza a JPEG
 * en el thumbnail; pedirlo a s2000 evita decodificar el original en el
 * serverless de Hobby (heic-decode se queda sin tiempo o memoria).
 */
export const DRIVE_RENDERED_IMAGE_SIZE = 2000;

export function isHeicHeifOrDng(name: string, mime?: string): boolean {
  const type = String(mime || "").toLowerCase();
  if (/image\/(heic|heif|heic-sequence|heif-sequence)/.test(type)) return true;
  if (/image\/(x-adobe-dng|dng|x-dcraw)/.test(type) || type === "image/x-dng") {
    return true;
  }
  return /\.(heic|heif|dng)$/i.test(name);
}

/** Incluye JPEG/PNG/WebP y los raw que vamos a pedir renderizados. */
export function isImportableDriveImage(name: string, mime?: string): boolean {
  const type = String(mime || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif|dng)$/i.test(name);
}

function isGoogleThumbnailHost(hostname: string): boolean {
  return (
    hostname === "googleusercontent.com" ||
    hostname.endsWith(".googleusercontent.com") ||
    hostname === "google.com" ||
    hostname.endsWith(".google.com")
  );
}

/** Sube el tamaño de un thumbnailLink (=s220 → =s2000). Si no hay link, arma el de lh3. */
export function renderedThumbnailUrl(
  thumbnailLink: string | undefined,
  fileId: string,
  size = DRIVE_RENDERED_IMAGE_SIZE,
): string {
  const px = String(size);
  const link = thumbnailLink?.trim();
  if (link) {
    try {
      const url = new URL(link);
      if (url.protocol === "https:" && isGoogleThumbnailHost(url.hostname)) {
        const href = url.toString();
        if (/=s\d+/i.test(href)) return href.replace(/=s\d+/i, `=s${px}`);
        if (/([?&])sz=[^&]*/i.test(href)) {
          return href.replace(/([?&])sz=[^&]*/i, `$1sz=w${px}`);
        }
        return `${href}=s${px}`;
      }
    } catch {
      /* link inválido: se usa el id */
    }
  }
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}=s${px}`;
}

export function looksLikeRasterImage(bytes: Buffer): boolean {
  if (bytes.length < 800) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return true;
  return bytes.subarray(0, 4).toString("ascii") === "RIFF";
}
