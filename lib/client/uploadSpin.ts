/**
 * Subida del giro 360 desde el admin.
 * WebP y AVIF que ya vienen listos no se recomprimen.
 * Los bytes van directo a la URL firmada de Supabase. El commit es al final.
 */
import { readApiError } from "@/lib/client/uploadPhotos";

export const SPIN_UPLOAD_CONCURRENCY = 6;
/** Intento inicial + 3 reintentos. */
export const SPIN_PUT_ATTEMPTS = 4;
export const SPIN_FRAME_MIN = 24;
export const SPIN_FRAME_MAX = 200;
const MAX_SPIN_BYTES = 20 * 1024 * 1024;

type SpinExt = "webp" | "avif";

type PreparedFrame = { file: File; ext: SpinExt };

type SignedUpload = {
  index: number;
  signedUrl: string;
  contentType?: string;
  path: string;
};

type SignedSet = {
  name: "m900" | "d1600";
  ext: SpinExt;
  count: number;
  uploads: SignedUpload[];
};

export function frameSortKey(name: string): number {
  const match = name.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

export function sortFramesByNumber(files: File[]): File[] {
  return [...files].sort((a, b) => {
    const delta = frameSortKey(a.name) - frameSortKey(b.name);
    if (delta !== 0) return delta;
    return a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" });
  });
}

export function createSpinVersion(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${time}${rand}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
}

function isWebp(file: File): boolean {
  return file.type === "image/webp" || /\.webp$/i.test(file.name);
}

function isAvif(file: File): boolean {
  return file.type === "image/avif" || /\.avif$/i.test(file.name);
}

function isJpegOrPng(file: File): boolean {
  return (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    /\.(jpe?g|png)$/i.test(file.name)
  );
}

function assertSize(file: File): void {
  if (!file.size || file.size < 32) {
    throw new Error(`«${file.name}» está vacío o corrupto.`);
  }
  if (file.size > MAX_SPIN_BYTES) {
    throw new Error(`«${file.name}» supera los 20 MB.`);
  }
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
      reject(new Error(`No se pudo leer «${file.name}».`));
    };
    img.src = url;
  });
}

async function encodeWebp(file: File): Promise<File> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, img.naturalWidth || img.width);
  canvas.height = Math.max(1, img.naturalHeight || img.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no pudo preparar la imagen.");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!blob || blob.type !== "image/webp") {
    throw new Error(`«${file.name}» no se pudo convertir a WebP. Súbelo ya en WebP.`);
  }
  if (blob.size > MAX_SPIN_BYTES) {
    throw new Error(`«${file.name}» supera los 20 MB al pasarlo a WebP.`);
  }
  const base = file.name.replace(/\.(jpe?g|png|webp|avif)$/i, "") || "frame";
  return new File([blob], `${base}.webp`, { type: "image/webp", lastModified: file.lastModified });
}

/** WebP se devuelve igual. JPG y PNG pasan a WebP. */
export async function prepareStandardFrame(file: File): Promise<PreparedFrame> {
  assertSize(file);
  if (isAvif(file)) {
    throw new Error(`«${file.name}» es AVIF. La selección estándar acepta WebP, JPG o PNG.`);
  }
  if (isWebp(file)) return { file, ext: "webp" };
  if (!isJpegOrPng(file)) {
    throw new Error(`«${file.name}» no es WebP, JPG ni PNG.`);
  }
  return { file: await encodeWebp(file), ext: "webp" };
}

/** AVIF y WebP de la HD se suben sin recomprimir. */
export async function prepareHdFrame(file: File): Promise<PreparedFrame> {
  assertSize(file);
  if (isAvif(file)) return { file, ext: "avif" };
  if (isWebp(file)) return { file, ext: "webp" };
  throw new Error(`«${file.name}» no es AVIF ni WebP. La HD no se recomprime.`);
}

async function prepareSet(
  files: File[],
  prepare: (file: File) => Promise<PreparedFrame>,
): Promise<PreparedFrame[]> {
  const prepared: PreparedFrame[] = [];
  for (const file of sortFramesByNumber(files)) {
    prepared.push(await prepare(file));
  }
  const ext = prepared[0]?.ext;
  if (!ext || prepared.some((frame) => frame.ext !== ext)) {
    throw new Error("Los fotogramas de un set tienen que compartir la misma extensión.");
  }
  return prepared;
}

async function putOnce(url: string, file: File, contentType: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": contentType,
        "x-upsert": "true",
        "cache-control": "31536000",
      },
    });
  } catch {
    throw new Error("Sin conexión al subir un fotograma.");
  }
  if (!res.ok) {
    throw new Error(`No se pudo subir un fotograma (HTTP ${res.status}).`);
  }
}

async function putWithRetries(
  url: string,
  file: File,
  contentType: string,
  retryDelayMs: number,
): Promise<void> {
  let last = "No se pudo subir un fotograma.";
  for (let attempt = 1; attempt <= SPIN_PUT_ATTEMPTS; attempt += 1) {
    try {
      await putOnce(url, file, contentType);
      return;
    } catch (err) {
      last = err instanceof Error ? err.message : last;
      if (attempt < SPIN_PUT_ATTEMPTS && retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }
  throw new Error(last);
}

async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  let failed = false;
  const errors: unknown[] = [];
  async function worker() {
    while (!failed) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        await fn(items[index]!);
      } catch (err) {
        failed = true;
        errors.push(err);
        return;
      }
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  if (errors[0]) throw errors[0];
}

export async function uploadSpinSets(opts: {
  slug: string;
  standard: File[];
  hd?: File[];
  onProgress?: (done: number, total: number) => void;
  retryDelayMs?: number;
  concurrency?: number;
}): Promise<{ count: number; message: string }> {
  const standardFiles = sortFramesByNumber(opts.standard);
  const hdFiles = sortFramesByNumber(opts.hd ?? []);
  if (standardFiles.length < SPIN_FRAME_MIN || standardFiles.length > SPIN_FRAME_MAX) {
    throw new Error(`El giro estándar necesita entre ${SPIN_FRAME_MIN} y ${SPIN_FRAME_MAX} fotogramas.`);
  }
  if (hdFiles.length > 0 && hdFiles.length !== standardFiles.length) {
    throw new Error("La HD tiene que tener la misma cantidad de fotogramas que el estándar.");
  }

  const standard = await prepareSet(standardFiles, prepareStandardFrame);
  const hd = hdFiles.length > 0 ? await prepareSet(hdFiles, prepareHdFrame) : [];
  const sets: Array<{ name: "m900" | "d1600"; ext: SpinExt; count: number }> = [
    { name: "m900", ext: standard[0]!.ext, count: standard.length },
  ];
  if (hd.length > 0) {
    sets.push({ name: "d1600", ext: hd[0]!.ext, count: hd.length });
  }

  const version = createSpinVersion();
  let planRes: Response;
  try {
    planRes = await fetch("/api/spin/upload-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: opts.slug, version, sets }),
    });
  } catch {
    throw new Error("Sin conexión al preparar el giro.");
  }
  if (!planRes.ok) throw new Error(await readApiError(planRes));
  const plan = (await planRes.json()) as { sets?: SignedSet[] };
  const jobs = jobsFromPlan(plan.sets ?? [], standard, hd);

  let done = 0;
  const total = jobs.length;
  opts.onProgress?.(0, total);
  const concurrency = opts.concurrency ?? SPIN_UPLOAD_CONCURRENCY;
  const retryDelayMs = opts.retryDelayMs ?? 250;
  await runPool(jobs, concurrency, async (job) => {
    await putWithRetries(job.signedUrl, job.file, job.contentType, retryDelayMs);
    done += 1;
    opts.onProgress?.(done, total);
  });

  let commitRes: Response;
  try {
    commitRes = await fetch("/api/spin/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: opts.slug, version, sets }),
    });
  } catch {
    throw new Error("Los fotogramas se subieron, pero no se pudo confirmar el giro. Si el visor no cambió, el vehículo sigue igual.");
  }
  if (!commitRes.ok) {
    throw new Error(await readApiError(commitRes));
  }

  const hdNote = hd.length > 0 ? " con HD" : "";
  return {
    count: standard.length,
    message: `Giro 360 guardado (${standard.length} fotogramas${hdNote}).`,
  };
}

function jobsFromPlan(sets: SignedSet[], standard: PreparedFrame[], hd: PreparedFrame[]) {
  const m900 = sets.find((set) => set.name === "m900");
  if (!m900 || m900.uploads.length !== standard.length) {
    throw new Error("El servidor no entregó todas las URLs del estándar.");
  }
  const ordered = [...m900.uploads].sort((a, b) => a.index - b.index);
  const jobs = standard.map((frame, index) => {
    const upload = ordered[index];
    if (!upload?.signedUrl) throw new Error("Falta una URL firmada del estándar.");
    return {
      signedUrl: upload.signedUrl,
      file: frame.file,
      contentType: upload.contentType || (frame.ext === "avif" ? "image/avif" : "image/webp"),
    };
  });
  if (hd.length === 0) return jobs;
  const d1600 = sets.find((set) => set.name === "d1600");
  if (!d1600 || d1600.uploads.length !== hd.length) {
    throw new Error("El servidor no entregó todas las URLs de la HD.");
  }
  const hdOrdered = [...d1600.uploads].sort((a, b) => a.index - b.index);
  hd.forEach((frame, index) => {
    const upload = hdOrdered[index];
    if (!upload?.signedUrl) throw new Error("Falta una URL firmada de la HD.");
    jobs.push({
      signedUrl: upload.signedUrl,
      file: frame.file,
      contentType: upload.contentType || (frame.ext === "avif" ? "image/avif" : "image/webp"),
    });
  });
  return jobs;
}
