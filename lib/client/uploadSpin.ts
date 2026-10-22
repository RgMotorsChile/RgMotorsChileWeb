/**
 * Subida del giro 360 desde el admin.
 * WebP y AVIF que ya vienen listos no se recomprimen.
 * Los bytes van directo a la URL firmada de Supabase. El commit es al final.
 */
import { readApiError } from "@/lib/client/uploadPhotos";
import { isRetryableSpinFailure, spinRetryDelayMs } from "@/lib/spinRetry";

export const SPIN_UPLOAD_CONCURRENCY = 6;
/** Intento inicial + 3 reintentos. */
export const SPIN_PUT_ATTEMPTS = 4;
export const SPIN_FRAME_MIN = 24;
export const SPIN_FRAME_MAX = 200;
/** Fotogramas que se firman en cada POST /api/spin/upload-urls. */
export const SPIN_SIGN_BATCH = 24;
export const SPIN_SIGN_TIMEOUT_MS = 25_000;
export const SPIN_SIGN_ATTEMPTS = 4;
export const SPIN_PUT_TIMEOUT_MS = 30_000;
export const SPIN_COMMIT_TIMEOUT_MS = 50_000;
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

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "AbortError";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
  offlineMessage: string,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (isAbortError(err)) throw new Error(timeoutMessage);
    throw new Error(offlineMessage);
  } finally {
    clearTimeout(timer);
  }
}

async function putOnce(url: string, file: File, contentType: string, timeoutMs: number): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": contentType,
          "x-upsert": "true",
          "cache-control": "31536000",
        },
      },
      timeoutMs,
      "Se agotó el tiempo al subir un fotograma.",
      "Sin conexión al subir un fotograma.",
    );
  } catch (err) {
    throw err instanceof Error ? err : new Error("Sin conexión al subir un fotograma.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      detail = "";
    }
    if (/too many connections|too many clients|remaining connection slots/i.test(detail)) {
      throw new Error("Too many connections issued to the database");
    }
    throw new Error(`No se pudo subir un fotograma (HTTP ${res.status}).`);
  }
}

async function putWithRetries(
  url: string,
  file: File,
  contentType: string,
  retryDelayMs: number,
  timeoutMs: number,
): Promise<void> {
  let last = "No se pudo subir un fotograma.";
  for (let attempt = 1; attempt <= SPIN_PUT_ATTEMPTS; attempt += 1) {
    try {
      await putOnce(url, file, contentType, timeoutMs);
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
  onProgress?: (done: number, total: number, phase?: "sign" | "upload") => void;
  retryDelayMs?: number;
  concurrency?: number;
  signBatchSize?: number;
  signTimeoutMs?: number;
  signAttempts?: number;
  putTimeoutMs?: number;
  commitTimeoutMs?: number;
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
  const version = createSpinVersion();
  const batchSize = Math.max(1, opts.signBatchSize ?? SPIN_SIGN_BATCH);
  const signTimeoutMs = opts.signTimeoutMs ?? SPIN_SIGN_TIMEOUT_MS;
  const signAttempts = opts.signAttempts ?? SPIN_SIGN_ATTEMPTS;
  const putTimeoutMs = opts.putTimeoutMs ?? SPIN_PUT_TIMEOUT_MS;
  const commitTimeoutMs = opts.commitTimeoutMs ?? SPIN_COMMIT_TIMEOUT_MS;
  const retryDelayMs = opts.retryDelayMs ?? 250;

  try {
    const jobs = await signInBatches({
      slug: opts.slug,
      version,
      standard,
      hd,
      batchSize,
      signTimeoutMs,
      signAttempts,
      retryDelayMs,
      onProgress: opts.onProgress,
    });

    let done = 0;
    const total = jobs.length;
    opts.onProgress?.(0, total, "upload");
    const concurrency = opts.concurrency ?? SPIN_UPLOAD_CONCURRENCY;
    await runPool(jobs, concurrency, async (job) => {
      await putWithRetries(job.signedUrl, job.file, job.contentType, retryDelayMs, putTimeoutMs);
      done += 1;
      opts.onProgress?.(done, total, "upload");
    });

    const sets = commitSets(standard, hd);
    const commitRes = await fetchWithTimeout(
      "/api/spin/commit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: opts.slug, version, sets }),
      },
      commitTimeoutMs,
      "Se agotó el tiempo al confirmar el giro.",
      "Los fotogramas se subieron, pero no se pudo confirmar el giro. Si el visor no cambió, el vehículo sigue igual.",
    );
    if (!commitRes.ok) {
      throw new Error(await readApiError(commitRes));
    }
  } catch (err) {
    const extra = await discardFailedAttempt(opts.slug, version);
    const message = err instanceof Error ? err.message : "No se pudo subir el giro.";
    throw new Error(`${message}${extra}`);
  }

  const hdNote = hd.length > 0 ? " con HD" : "";
  return {
    count: standard.length,
    message: `Giro 360 guardado (${standard.length} fotogramas${hdNote}).`,
  };
}

function commitSets(standard: PreparedFrame[], hd: PreparedFrame[]) {
  const sets: Array<{ name: "m900" | "d1600"; ext: SpinExt; count: number }> = [
    { name: "m900", ext: standard[0]!.ext, count: standard.length },
  ];
  if (hd.length > 0) sets.push({ name: "d1600", ext: hd[0]!.ext, count: hd.length });
  return sets;
}

async function signInBatches(opts: {
  slug: string;
  version: string;
  standard: PreparedFrame[];
  hd: PreparedFrame[];
  batchSize: number;
  signTimeoutMs: number;
  signAttempts: number;
  retryDelayMs: number;
  onProgress?: (done: number, total: number, phase?: "sign" | "upload") => void;
}) {
  const total = opts.standard.length + opts.hd.length;
  const jobs: Array<{ signedUrl: string; file: File; contentType: string }> = [];
  let signed = 0;
  opts.onProgress?.(0, total, "sign");
  const groups: Array<{ name: "m900" | "d1600"; frames: PreparedFrame[] }> = [
    { name: "m900", frames: opts.standard },
  ];
  if (opts.hd.length > 0) groups.push({ name: "d1600", frames: opts.hd });

  for (let from = 1; from <= opts.standard.length; from += opts.batchSize) {
    const to = Math.min(opts.standard.length, from + opts.batchSize - 1);
    for (const group of groups) {
      const plan = await requestSignedBatch({
        slug: opts.slug,
        version: opts.version,
        name: group.name,
        ext: group.frames[0]!.ext,
        count: group.frames.length,
        from,
        to,
        timeoutMs: opts.signTimeoutMs,
        attempts: opts.signAttempts,
        retryDelayMs: opts.retryDelayMs,
      });
      jobs.push(...jobsFromSlice(plan.sets ?? [], group.name, group.frames, from, to));
      signed += to - from + 1;
      opts.onProgress?.(signed, total, "sign");
    }
  }
  return jobs;
}

/** Una petición de firma a la vez, aunque haya dos subidas en el admin. */
let signQueue: Promise<void> = Promise.resolve();

function enqueueSign<T>(task: () => Promise<T>): Promise<T> {
  const run = signQueue.then(task, task);
  signQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function requestSignedBatch(opts: {
  slug: string;
  version: string;
  name: "m900" | "d1600";
  ext: SpinExt;
  count: number;
  from: number;
  to: number;
  timeoutMs: number;
  attempts: number;
  retryDelayMs: number;
}): Promise<{ sets?: SignedSet[]; version?: string }> {
  return enqueueSign(async () => {
    let last = "No se pudo firmar las subidas.";
    for (let attempt = 1; attempt <= opts.attempts; attempt += 1) {
      try {
        const res = await fetchWithTimeout(
          "/api/spin/upload-urls",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug: opts.slug,
              version: opts.version,
              sets: [{ name: opts.name, ext: opts.ext, count: opts.count, from: opts.from, to: opts.to }],
            }),
          },
          opts.timeoutMs,
          "Se agotó el tiempo al firmar las subidas. No se subió este intento.",
          "Sin conexión al preparar el giro.",
        );
        if (!res.ok) {
          last = await readApiError(res);
          if (!isRetryableSpinFailure(res.status, last) || attempt === opts.attempts) {
            throw new Error(last);
          }
        } else {
          const plan = (await res.json()) as { sets?: SignedSet[]; version?: string };
          if (plan.version && plan.version !== opts.version) {
            throw new Error("El servidor cambió la versión del giro. Reintenta.");
          }
          return plan;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : last;
        last = message;
        const timedOut = /agotó el tiempo|Sin conexión/i.test(message);
        const retryable = timedOut || isRetryableSpinFailure(undefined, message);
        if (!retryable || attempt === opts.attempts) {
          throw err instanceof Error ? err : new Error(message);
        }
      }
      const wait = spinRetryDelayMs(attempt, opts.retryDelayMs);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    throw new Error(last);
  });
}

async function discardFailedAttempt(slug: string, version: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      "/api/spin/abort",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, version }),
      },
      20_000,
      "Se agotó el tiempo al borrar el intento fallido.",
      "Sin conexión al borrar el intento fallido.",
    );
    if (!res.ok) {
      return ` No se pudo borrar lo subido: ${await readApiError(res)}`;
    }
    const body = (await res.json()) as { deleted?: number };
    if ((body.deleted ?? 0) > 0) return " Se borró lo que este intento había subido.";
    return "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo borrar lo subido.";
    return ` No se pudo borrar lo subido: ${message}`;
  }
}

function jobsFromSlice(
  sets: SignedSet[],
  name: "m900" | "d1600",
  frames: PreparedFrame[],
  from: number,
  to: number,
) {
  const signed = sets.find((set) => set.name === name);
  const expected = to - from + 1;
  if (!signed || signed.uploads.length !== expected) {
    throw new Error(
      name === "m900"
        ? "El servidor no entregó todas las URLs del estándar."
        : "El servidor no entregó todas las URLs de la HD.",
    );
  }
  const byIndex = new Map(signed.uploads.map((upload) => [upload.index, upload]));
  const jobs = [];
  for (let index = from; index <= to; index += 1) {
    const frame = frames[index - 1];
    const upload = byIndex.get(index);
    if (!frame || !upload?.signedUrl) {
      throw new Error(name === "m900" ? "Falta una URL firmada del estándar." : "Falta una URL firmada de la HD.");
    }
    jobs.push({
      signedUrl: upload.signedUrl,
      file: frame.file,
      contentType: upload.contentType || (frame.ext === "avif" ? "image/avif" : "image/webp"),
    });
  }
  return jobs;
}
