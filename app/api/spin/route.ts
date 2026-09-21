import { NextRequest } from "next/server";
import { mkdtemp, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { processVideoToSpin } from "@/lib/server/spinProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Lista los giros 360° ya generados (público: solo metadatos, sin archivos). */
export async function GET() {
  const base = join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "spin");
  const out: Array<{ slug: string; count: number; studio?: boolean; aiUsed?: boolean; updatedAt?: string }> = [];
  try {
    const dirs = await readdir(base, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try {
        const raw = await readFile(join(base, d.name, "manifest.json"), "utf8");
        const m = JSON.parse(raw);
        out.push({ slug: d.name, count: m.count, studio: m.studio, aiUsed: m.aiUsed, updatedAt: m.updatedAt });
      } catch {
        const files = (await readdir(join(base, d.name))).filter((f) => /^\d+\.jpg$/.test(f));
        if (files.length) out.push({ slug: d.name, count: files.length });
      }
    }
  } catch {
    /* carpeta aún no existe */
  }
  return Response.json({ spins: out });
}

/** Sube un video y genera el giro 360°, transmitiendo el progreso (NDJSON). */
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "No se pudo leer el formulario." }, { status: 400 });
  }

  const file = form.get("video");
  const slug = String(form.get("slug") || "").trim();
  const frames = parseInt(String(form.get("frames") || "32"), 10);
  const studio = String(form.get("studio") || "true") === "true";

  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo de video." }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    return Response.json({ error: "Slug inválido." }, { status: 400 });
  }

  // Guarda el video subido en un archivo temporal.
  const dir = await mkdtemp(join(tmpdir(), "rgvideo-"));
  const ext = (file.name.split(".").pop() || "mp4").replace(/[^a-z0-9]/gi, "");
  const videoPath = join(dir, `input.${ext}`);
  await writeFile(videoPath, Buffer.from(await file.arrayBuffer()));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await processVideoToSpin({
          videoPath,
          slug,
          frames,
          studio,
          onProgress: (p) => send({ type: "progress", ...p }),
        });
        send({ type: "done", ...result });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Error desconocido" });
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
