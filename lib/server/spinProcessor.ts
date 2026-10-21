/**
 * Pipeline de servidor: convierte un VIDEO de vuelta al auto en un giro 360°
 * profesional por fotos, listo para el visor PhotoSpin360.
 *
 * Etapas:
 *   1. ffprobe  -> duración del video.
 *   2. ffmpeg   -> extrae N fotogramas repartidos parejo, con mejora de imagen
 *                  (denoise + normalización de color + nitidez).
 *   3. "Estudio" (opcional) -> recorta el fondo con IA y compone el auto sobre
 *                  un fondo oscuro tipo showroom con sombra de contacto. Si la
 *                  IA no está disponible, hace un encuadre 16:9 con viñeta.
 *   4. Escribe public/cars/spin/<slug>/001.jpg ... y un manifest.json.
 *
 * Requiere ffmpeg/ffprobe en el PATH del proceso del servidor.
 */
import { spawn } from "node:child_process";
import { mkdir, rm, readdir, writeFile, mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const W = 1600;
const H = 900; // 16:9

export type ProcessOptions = {
  videoPath: string;
  slug: string;
  frames?: number;
  studio?: boolean;
  onProgress?: (p: { stage: string; pct: number; msg?: string }) => void;
};

export type ProcessResult = {
  slug: string;
  count: number;
  studio: boolean;
  aiUsed: boolean;
  dir: string;
};

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} salió con código ${code}\n${err}`))
    );
  });
}

async function hasBinary(cmd: string): Promise<boolean> {
  try {
    await run(cmd, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Carga perezosa del recorte de fondo con IA. Devuelve null si no está
 * disponible. Se le pasa un Blob con tipo explícito (image/png): pasar una
 * ruta absoluta de Windows falla porque la librería la interpreta como URL
 * ("Unsupported protocol: c:").
 */
async function loadBgRemover(): Promise<
  ((buf: Buffer) => Promise<Buffer>) | null
> {
  // En Vercel no cargamos imgly/onnx (~300MB): hincha Functions Storage del plan Hobby.
  if (process.env.VERCEL) return null;
  try {
    // Import dinámico por string: el paquete es opcional (solo scripts locales).
    const pkg = "@imgly/background-removal-node";
    const mod: any = await import(pkg);
    const removeBackground = mod.removeBackground ?? mod.default?.removeBackground;
    if (!removeBackground) return null;
    return async (buf: Buffer) => {
      const inputBlob = new Blob([new Uint8Array(buf)], { type: "image/png" });
      const blob: Blob = await removeBackground(inputBlob, {
        output: { format: "image/png" },
      });
      return Buffer.from(await blob.arrayBuffer());
    };
  } catch {
    return null;
  }
}

export async function processVideoToSpin(
  opts: ProcessOptions
): Promise<ProcessResult> {
  const { videoPath, slug, onProgress } = opts;
  const frames = Math.max(12, Math.min(48, opts.frames ?? 32));
  const studio = false; // el fondo siempre es el patio real de RG Motors (nunca estudio)
  const report = (stage: string, pct: number, msg?: string) =>
    onProgress?.({ stage, pct, msg });

  if (!/^[a-z0-9-]+$/i.test(slug)) throw new Error("Slug inválido.");
  if (!existsSync(videoPath)) throw new Error("No se encontró el video.");
  if (!(await hasBinary("ffmpeg")) || !(await hasBinary("ffprobe"))) {
    throw new Error(
      "ffmpeg no está disponible en el servidor. Instálalo (winget install Gyan.FFmpeg) y reinicia el servidor."
    );
  }

  report("probe", 2, "Analizando el video…");
  const durationRaw = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  const duration = parseFloat(durationRaw.trim());
  if (!duration || Number.isNaN(duration)) throw new Error("Video ilegible o sin duración.");

  const rawDir = await mkdtemp(join(tmpdir(), "rgspin-"));
  const outDir = join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "spin", slug);

  try {
    // --- 2. Extracción + mejora de imagen con ffmpeg -----------------------
    report("extract", 10, "Extrayendo fotogramas…");
    const fps = frames / duration;
    const vf = [
      `fps=${fps}`,
      `scale=${W}:-1:flags=lanczos`,
      "hqdn3d=2:1:2:2",
      "eq=contrast=1.06:saturation=1.08:brightness=0.01",
      "unsharp=5:5:0.8:5:5:0.0",
    ].join(",");
    await run("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vf",
      vf,
      "-frames:v",
      String(frames + 1),
      "-q:v",
      "2",
      join(rawDir, "%03d.png"),
    ]);

    let rawFiles = (await readdir(rawDir))
      .filter((f) => f.endsWith(".png"))
      .sort();
    rawFiles = rawFiles.slice(0, frames);
    if (rawFiles.length === 0) throw new Error("ffmpeg no generó fotogramas.");

    // --- 3. Composición de estudio ----------------------------------------
    const { createCanvas, loadImage }: any = await import("@napi-rs/canvas");
    const bgRemove = studio ? await loadBgRemover() : null;
    let aiUsed = false;

    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    let i = 0;
    for (const file of rawFiles) {
      const rawPath = join(rawDir, file);
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");
      drawStudioBackground(ctx);

      if (bgRemove) {
        try {
          const rawBuf = await readFile(rawPath);
          const cut = await bgRemove(rawBuf);
          const img = await loadImage(cut);
          drawCentered(ctx, img, true, createCanvas);
          aiUsed = true;
        } catch (err) {
          console.error("[spin] bg-remove falló:", err instanceof Error ? err.message : err);
          const img = await loadImage(rawPath);
          drawCentered(ctx, img, false);
        }
      } else {
        const img = await loadImage(rawPath);
        drawCentered(ctx, img, false);
        drawVignette(ctx);
      }

      const jpg = await canvas.encode("jpeg", 86);
      await writeFile(join(outDir, `${String(i + 1).padStart(3, "0")}.jpg`), jpg);
      i += 1;
      report("compose", 20 + Math.round((i / rawFiles.length) * 75), `Procesando ${i}/${rawFiles.length}…`);
    }

    // --- 4. Manifest -------------------------------------------------------
    const manifest = {
      slug,
      count: rawFiles.length,
      studio,
      aiUsed,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    report("done", 100, "Listo");
    return { slug, count: rawFiles.length, studio, aiUsed, dir: outDir };
  } finally {
    await rm(rawDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---- Helpers de dibujo (estudio) ------------------------------------------
function findBoundingBox(ctxTemp: any, iw: number, ih: number) {
  try {
    const imageData = ctxTemp.getImageData(0, 0, iw, ih);
    const data = imageData.data;
    let minX = iw, minY = ih, maxX = -1, maxY = -1;

    for (let y = 0; y < ih; y += 2) {
      for (let x = 0; x < iw; x += 2) {
        const alpha = data[(y * iw + x) * 4 + 3];
        if (alpha > 18) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return { minX: 0, minY: 0, cropW: iw, cropH: ih };
    }

    // Margen de seguridad de 2px
    minX = Math.max(0, minX - 2);
    minY = Math.max(0, minY - 2);
    maxX = Math.min(iw - 1, maxX + 2);
    maxY = Math.min(ih - 1, maxY + 2);

    return {
      minX,
      minY,
      cropW: maxX - minX + 1,
      cropH: maxY - minY + 1,
    };
  } catch {
    return { minX: 0, minY: 0, cropW: iw, cropH: ih };
  }
}

function drawStudioBackground(ctx: any) {
  // Degradado vertical oscuro tipo showroom premium.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#141820");
  g.addColorStop(0.55, "#0b0e13");
  g.addColorStop(1, "#050608");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Halo de luz suave azulada/plateada en el centro.
  const r = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.48, W * 0.65);
  r.addColorStop(0, "rgba(80, 120, 170, 0.22)");
  r.addColorStop(0.6, "rgba(30, 50, 80, 0.08)");
  r.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);

  // Línea sutil de horizonte del piso
  const floorY = H * 0.83;
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, H);
  floorGrad.addColorStop(0, "rgba(255, 255, 255, 0.03)");
  floorGrad.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, floorY, W, H - floorY);
}

function drawVignette(ctx: any) {
  const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
  r.addColorStop(0, "rgba(0,0,0,0)");
  r.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Dibuja el auto centrado y "aterrizado". Con recorte IA, escanea el Bounding Box
 * exacto del vehículo para autocentrarlo y estabilizar el tamaño horizontal y vertical.
 * Añade reflejo en piso tipo showroom y sombra multi-contacto.
 */
function drawCentered(ctx: any, img: any, cutout: boolean, createCanvasFn?: any) {
  const iw = img.width;
  const ih = img.height;

  if (!cutout) {
    const scale = Math.min(W / iw, H / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }

  // Si tenemos función de canvas auxiliar, escaneamos el bounding box real del auto
  let minX = 0, minY = 0, cropW = iw, cropH = ih;
  if (createCanvasFn) {
    const tempCanvas = createCanvasFn(iw, ih);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(img, 0, 0);
    const bbox = findBoundingBox(tempCtx, iw, ih);
    minX = bbox.minX;
    minY = bbox.minY;
    cropW = bbox.cropW;
    cropH = bbox.cropH;
  }

  // Normalizado de tamaño por bounding box real
  const targetH = H * 0.54;
  let scale = targetH / cropH;
  if (cropW * scale > W * 0.88) scale = (W * 0.88) / cropW;

  const dw = cropW * scale;
  const dh = cropH * scale;
  const dx = (W - dw) / 2;
  const baseline = H * 0.83;
  const dy = baseline - dh;

  // --- Reflejo sutil en el piso de exhibición ---
  ctx.save();
  ctx.translate(0, baseline * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = 0.12;
  ctx.drawImage(img, minX, minY, cropW, cropH, dx, dy, dw, dh);

  // Gradiente de desvanecimiento para el reflejo
  const refMask = ctx.createLinearGradient(0, baseline, 0, baseline + dh * 0.5);
  refMask.addColorStop(0, "rgba(5, 6, 8, 0)");
  refMask.addColorStop(1, "rgba(5, 6, 8, 1)");
  ctx.fillStyle = refMask;
  ctx.globalAlpha = 1.0;
  ctx.fillRect(0, baseline, W, H - baseline);
  ctx.restore();

  // --- Sombras de contacto multi-capa ---
  ctx.save();
  const shadowY = baseline + 2;

  // Capa 1: Sombra oscura directa bajo los neumáticos
  const coreGrad = ctx.createRadialGradient(W / 2, shadowY, dw * 0.05, W / 2, shadowY, dw * 0.48);
  coreGrad.addColorStop(0, "rgba(0, 0, 0, 0.65)");
  coreGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.35)");
  coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.ellipse(W / 2, shadowY, dw * 0.47, dh * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // Capa 2: Sombra ambiental difusa
  const ambGrad = ctx.createRadialGradient(W / 2, shadowY + 4, dw * 0.1, W / 2, shadowY + 4, dw * 0.58);
  ambGrad.addColorStop(0, "rgba(0, 0, 0, 0.30)");
  ambGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = ambGrad;
  ctx.beginPath();
  ctx.ellipse(W / 2, shadowY + 4, dw * 0.54, dh * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- Auto recortado ajustado y centrado ---
  ctx.drawImage(img, minX, minY, cropW, cropH, dx, dy, dw, dh);
}

