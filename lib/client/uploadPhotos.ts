/**
 * Helpers de subida de fotos en el admin (cliente).
 * Prioriza calidad: solo redimensiona/comprime lo mínimo para no superar
 * el límite ~4.5 MB de Vercel (subida de a una).
 */

export const VERCEL_SAFE_UPLOAD_BYTES = 3_200_000;
/** Techo blando: preferible no bajar de esta calidad salvo necesidad. */
export const SOFT_TARGET_BYTES = 2_400_000;
export const MAX_IMAGE_EDGE = 3200;
export const WEBP_QUALITY_START = 0.92;
export const JPEG_QUALITY_START = 0.92;
/** No bajar de esto salvo que el archivo aún exceda el límite de Vercel. */
export const MIN_QUALITY_FOR_SIZE = 0.82;
export const MIN_QUALITY_HARD = 0.72;

/** Lee el cuerpo aunque no sea JSON (ej. "Request Entity Too Large"). */
export async function readApiError(res: Response): Promise<string> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    return `Error al subir (HTTP ${res.status}).`;
  }
  try {
    const j = JSON.parse(text) as { error?: string; message?: string };
    if (j.error) return j.error;
    if (j.message) return j.message;
  } catch {
    /* texto plano */
  }
  const t = text.trim();
  if (/request entity too large/i.test(t) || res.status === 413) {
    return "El archivo sigue siendo demasiado grande para Vercel. Sube de a una foto o reduce un poco el tamaño.";
  }
  if (res.status === 401 || res.status === 403) {
    return "Sesión de admin expirada o sin permiso. Vuelve a iniciar sesión.";
  }
  if (res.status === 503) {
    return t || "Storage no disponible (Blob/KV). Revisa las variables en Vercel.";
  }
  if (t.startsWith("<!") || t.toLowerCase().includes("<html")) {
    return `Error del servidor (HTTP ${res.status}). Intenta de nuevo.`;
  }
  if (t.length > 0 && t.length < 280) return t;
  return `Error al subir (HTTP ${res.status}).`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo leer «${file.name}». Prueba con otra foto.`));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function supportsWebpExport(): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function isAlreadyWebSafe(file: File): boolean {
  const webSafe =
    file.type === "image/webp" ||
    file.type === "image/jpeg" ||
    /\.(webp|jpe?g)$/i.test(file.name);
  return webSafe && file.size > 32 && file.size <= VERCEL_SAFE_UPLOAD_BYTES;
}

export function isHeicLike(file: File): boolean {
  return (
    /image\/(heic|heif)/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

/** iPhone HEIC → JPEG vía heic2any (antes de canvas / WebP). */
async function convertHeicToJpegFile(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) {
    throw new Error(`No se pudo convertir «${file.name}» de HEIC a JPEG.`);
  }
  const base = file.name.replace(/\.(heic|heif)$/i, "") || "photo";
  return new File([blob], `${base}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/**
 * Prepara la imagen para subir priorizando calidad.
 * - HEIC/HEIF (iPhone) → JPEG automático.
 * - Si ya es JPEG/WebP y cabe en Vercel, no se reprocesa.
 * - Si no, exporta WebP (o JPEG) a calidad alta; solo baja calidad/tamaño
 *   si hace falta para el límite de subida.
 */
export async function convertImageToWebp(file: File): Promise<File> {
  if (!file || file.size < 32) {
    throw new Error(`«${file?.name || "archivo"}» está vacío o corrupto.`);
  }

  const isImage =
    /^image\/(jpeg|jpg|png|webp|avif|heic|heif)$/i.test(file.type) ||
    /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name);
  if (!isImage) {
    throw new Error(`«${file.name}» no es una imagen válida.`);
  }

  let working = file;
  if (isHeicLike(working)) {
    try {
      working = await convertHeicToJpegFile(working);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "error desconocido";
      throw new Error(
        `«${file.name}» es HEIC (iPhone) y no se pudo convertir: ${detail}`,
      );
    }
  }

  if (isAlreadyWebSafe(working)) {
    return working;
  }

  const img = await loadImage(working);
  let { width, height } = img;
  if (!width || !height) {
    throw new Error(`«${file.name}» no tiene dimensiones válidas.`);
  }

  const maxEdge = Math.max(width, height);
  if (maxEdge > MAX_IMAGE_EDGE) {
    const scale = MAX_IMAGE_EDGE / maxEdge;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("El navegador no pudo preparar la imagen (canvas).");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const useWebp = supportsWebpExport();
  const mime = useWebp ? "image/webp" : "image/jpeg";
  const ext = useWebp ? "webp" : "jpg";
  let quality = useWebp ? WEBP_QUALITY_START : JPEG_QUALITY_START;
  let surface: HTMLCanvasElement = canvas;
  let blob = await canvasToBlob(surface, mime, quality);

  while (blob && blob.size > SOFT_TARGET_BYTES && quality > MIN_QUALITY_FOR_SIZE) {
    quality = Math.max(MIN_QUALITY_FOR_SIZE, quality - 0.03);
    blob = await canvasToBlob(surface, mime, quality);
  }

  while (blob && blob.size > VERCEL_SAFE_UPLOAD_BYTES && quality > MIN_QUALITY_HARD) {
    quality = Math.max(MIN_QUALITY_HARD, quality - 0.04);
    blob = await canvasToBlob(surface, mime, quality);
  }

  let scalePass = 0;
  while (blob && blob.size > VERCEL_SAFE_UPLOAD_BYTES && scalePass < 3) {
    scalePass++;
    const scale = 0.85;
    const c2 = document.createElement("canvas");
    c2.width = Math.max(1, Math.round(surface.width * scale));
    c2.height = Math.max(1, Math.round(surface.height * scale));
    const ctx2 = c2.getContext("2d");
    if (!ctx2) break;
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    ctx2.drawImage(surface, 0, 0, c2.width, c2.height);
    surface = c2;
    quality = Math.max(quality, 0.88);
    blob = await canvasToBlob(surface, mime, quality);
    while (blob && blob.size > VERCEL_SAFE_UPLOAD_BYTES && quality > MIN_QUALITY_HARD) {
      quality = Math.max(MIN_QUALITY_HARD, quality - 0.04);
      blob = await canvasToBlob(surface, mime, quality);
    }
  }

  if (!blob) {
    throw new Error(`No se pudo convertir «${file.name}». Prueba JPG.`);
  }
  if (blob.size > VERCEL_SAFE_UPLOAD_BYTES) {
    throw new Error(
      `«${file.name}» sigue pesando ${(blob.size / 1024 / 1024).toFixed(1)} MB tras optimizar. Usa una foto más liviana.`,
    );
  }

  const base = file.name.replace(/\.(heic|heif|jpe?g|png|webp|avif)$/i, "") || "photo";
  return new File([blob], `${base}.${ext}`, {
    type: mime,
    lastModified: Date.now(),
  });
}

/** @deprecated usar convertImageToWebp */
export async function prepareImageForUpload(file: File): Promise<File> {
  return convertImageToWebp(file);
}

/** Convierte un lote al seleccionar (omite las que fallen y reporta). */
export async function convertFilesToWebpBatch(
  files: File[],
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<{ files: File[]; errors: string[] }> {
  const out: File[] = [];
  const errors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    onProgress?.(i, files.length, f.name);
    try {
      out.push(await convertImageToWebp(f));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Falló ${f.name}`);
    }
  }
  onProgress?.(files.length, files.length, "");
  return { files: out, errors };
}

export type UploadProgress = {
  done: number;
  total: number;
  currentName: string;
};

async function postOnePhoto(
  slug: string,
  uploadType: string,
  prepared: File,
): Promise<void> {
  const fd = new FormData();
  fd.append("slug", slug);
  fd.append("type", uploadType);
  fd.append("files", prepared);

  let res: Response;
  try {
    res = await fetch("/api/photos", { method: "POST", body: fd });
  } catch {
    throw new Error("Sin conexión al servidor. Revisa internet e intenta de nuevo.");
  }

  // Un reintento en 502/503/504 (cold start / blip)
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const fd2 = new FormData();
      fd2.append("slug", slug);
      fd2.append("type", uploadType);
      fd2.append("files", prepared);
      res = await fetch("/api/photos", { method: "POST", body: fd2 });
    } catch {
      throw new Error("Sin conexión al servidor tras reintento.");
    }
  }

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  const text = await res.text();
  let data: { success?: boolean; error?: string };
  try {
    data = JSON.parse(text) as { success?: boolean; error?: string };
  } catch {
    throw new Error(
      /request entity too large/i.test(text)
        ? "Archivo demasiado grande para Vercel."
        : "Respuesta inválida del servidor al subir.",
    );
  }
  if (!data.success) {
    throw new Error(data.error || "La subida no se confirmó.");
  }
}

/** Sube fotos de a una (ya deberían venir preparadas). */
export async function uploadPhotosSequentially(opts: {
  slug: string;
  type: "gallery" | "cover";
  files: File[];
  onProgress?: (p: UploadProgress) => void;
}): Promise<{ count: number; message: string; errors: string[] }> {
  const { slug, type, files, onProgress } = opts;
  let uploaded = 0;
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const original = files[i]!;
    onProgress?.({ done: i, total: files.length, currentName: original.name });

    try {
      const prepared = await convertImageToWebp(original);
      if (prepared.size > VERCEL_SAFE_UPLOAD_BYTES) {
        errors.push(`${original.name}: sigue pesando demasiado tras preparar.`);
        continue;
      }
      let uploadType: string = type;
      if (type === "cover") {
        uploadType = i === 0 && uploaded === 0 ? "cover" : "gallery";
      }
      await postOnePhoto(slug, uploadType, prepared);
      uploaded++;
      // Pequeña pausa para que KV no reciba writes pegados en la misma instancia
      if (i < files.length - 1) {
        await new Promise((r) => setTimeout(r, 120));
      }
    } catch (err) {
      errors.push(`${original.name}: ${err instanceof Error ? err.message : "falló"}`);
    }
  }

  onProgress?.({ done: files.length, total: files.length, currentName: "" });

  if (uploaded === 0) {
    throw new Error(errors[0] || "No se pudo subir ninguna foto.");
  }

  const msg =
    uploaded === files.length
      ? `Se subieron ${uploaded} foto${uploaded === 1 ? "" : "s"} correctamente.`
      : `Se subieron ${uploaded} de ${files.length}. ${errors.slice(0, 2).join(" · ")}`;

  return { count: uploaded, message: msg, errors };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
