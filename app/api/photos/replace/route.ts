import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { getVehicleBySlug, saveVehicle } from "@/lib/server/vehiclesStore";
import { storeMediaFile } from "@/lib/server/mediaStorage";
import { isBlobReady, isVercelProduction } from "@/lib/server/storageHealth";
import { convertHeicToJpegBuffer, isHeicFile } from "@/lib/server/convertHeic";
import {
  buildReplacementPath,
  swapPhotoUrl,
  validateReplacementFile,
} from "@/lib/server/photoReplace";
import { markDrivePhotoReplaced } from "@/lib/server/driveOAuthSyncService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function extFor(file: File): string {
  const e = (file.name.split(".").pop() || "").toLowerCase();
  if (e === "jpeg") return "jpg";
  if (/^(jpg|png|webp|avif)$/.test(e)) return e;
  if (/png/i.test(file.type)) return "png";
  if (/webp/i.test(file.type)) return "webp";
  return "jpg";
}

/** POST multipart: slug, oldUrl, file → reemplaza esa foto en la misma posición. */
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (isVercelProduction() && !isBlobReady()) {
    return NextResponse.json({ error: "Falta configurar Blob en Vercel." }, { status: 503 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulario inválido o archivo muy grande." }, { status: 400 });
  }
  const slug = String(form.get("slug") || "").trim();
  const oldUrl = String(form.get("oldUrl") || "").trim();
  const file = form.get("file");
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "Slug no válido." }, { status: 400 });
  }
  if (!oldUrl) return NextResponse.json({ error: "Falta la foto a reemplazar." }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se seleccionó archivo." }, { status: 400 });
  }
  const invalid = validateReplacementFile(file);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: file.size > 0 && /pesa/.test(invalid) ? 413 : 400 });
  }

  const vehicle = await getVehicleBySlug(slug, { bypassCache: true, scope: "staff" });
  if (!vehicle) return NextResponse.json({ error: "No existe el vehículo." }, { status: 404 });
  if (!swapPhotoUrl(vehicle, oldUrl, "x")) {
    return NextResponse.json({ error: "Esa foto no pertenece a este vehículo." }, { status: 400 });
  }

  try {
    let bytes: Buffer = Buffer.from(await file.arrayBuffer());
    let contentType = file.type || "image/jpeg";
    let ext = extFor(file);
    if (isHeicFile(file.name, file.type)) {
      const c = await convertHeicToJpegBuffer(bytes, 90);
      bytes = c.buffer;
      contentType = c.contentType;
      ext = c.ext;
    }
    const stored = await storeMediaFile({
      bytes,
      relativePath: buildReplacementPath(slug, oldUrl, ext),
      contentType,
    });
    const newUrl = stored.url.startsWith("http") ? stored.url : stored.relativePath;
    const swapped = swapPhotoUrl(vehicle, oldUrl, newUrl)!;
    const saved = await saveVehicle({
      ...vehicle,
      image: swapped.image || vehicle.image,
      gallery: swapped.gallery,
      hasRealPhotos: true,
    });
    if (!saved.success) {
      return NextResponse.json({ error: saved.error || "No se guardó el vehículo." }, { status: 500 });
    }
    // El blob viejo no se borra (respaldo). El sync de Drive queda avisado.
    await markDrivePhotoReplaced(oldUrl, newUrl).catch((err) =>
      console.warn("[photos/replace] no se marcó el caché de Drive:", err),
    );
    return NextResponse.json({ success: true, oldUrl, newUrl, isCover: swapped.image === newUrl });
  } catch (err) {
    console.error("[photos/replace]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al reemplazar la foto." },
      { status: 500 },
    );
  }
}
