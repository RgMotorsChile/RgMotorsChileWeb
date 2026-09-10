import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getVehicleBySlug, saveVehicle } from "@/lib/server/vehiclesStore";
import { storeMediaFile } from "@/lib/server/mediaStorage";
import { isBlobReady, isVercelProduction } from "@/lib/server/storageHealth";
import { convertHeicToJpegBuffer, isHeicFile } from "@/lib/server/convertHeic";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import {
  driveFileId,
  mediaUrlsEqual,
  normalizeMediaUrl,
} from "@/lib/vehicles/frontCoverMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Alineado con el cliente: techo seguro bajo el límite ~4.5 MB de Vercel. */
const MAX_FILE_BYTES = 3_200_000;
const MAX_FILES_PER_REQUEST = 8;
const ALLOWED_EXT = /^(jpe?g|png|webp|avif|heic|heif)$/i;
const ALLOWED_MIME =
  /^(image\/(jpeg|jpg|png|webp|avif|heic|heif)|application\/octet-stream)$/i;

function publicMediaUrl(stored: { url: string; relativePath: string }): string {
  if (stored.url.startsWith("http")) return stored.url;
  const path = stored.relativePath.startsWith("/")
    ? stored.relativePath
    : `/${stored.relativePath}`;
  return path;
}

function extOf(file: File): string {
  const fromName = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName === "heic" || fromName === "heif") return "jpg";
  if (fromName && ALLOWED_EXT.test(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (/webp/i.test(file.type)) return "webp";
  if (/png/i.test(file.type)) return "png";
  if (/avif/i.test(file.type)) return "avif";
  if (/heic|heif/i.test(file.type)) return "jpg";
  return "jpg";
}

function isAllowedImage(file: File): boolean {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ALLOWED_EXT.test(ext)) return true;
  if (file.type && ALLOWED_MIME.test(file.type)) return true;
  return false;
}

async function fileToStoredBytes(file: File): Promise<{
  bytes: Buffer;
  contentType: string;
  ext: string;
}> {
  const raw = Buffer.from(await file.arrayBuffer());
  if (isHeicFile(file.name, file.type)) {
    const converted = await convertHeicToJpegBuffer(raw, 90);
    return {
      bytes: converted.buffer,
      contentType: converted.contentType,
      ext: converted.ext,
    };
  }
  return {
    bytes: raw,
    contentType: file.type || guessMime(extOf(file)),
    ext: extOf(file),
  };
}

function guessMime(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

/**
 * Obtiene las fotos subidas y recursos multimedia de un vehículo.
 * Fuente de verdad en producción: vehicle.gallery / image en KV (URLs Blob).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "Slug inválido o no especificado." }, { status: 400 });
  }

  const uploadDir = join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "uploads", slug);
  const spinDir = join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "spin", slug);

  const gallery: Array<{ name: string; url: string; size: number; isCover?: boolean }> = [];
  let spinCount = 0;

  // Siempre fresco: tras subir, otra instancia no debe servir caché vieja sin fotos
  const vehicle = await getVehicleBySlug(slug, { bypassCache: true });
  const currentCover = vehicle?.image ? normalizeMediaUrl(vehicle.image) : "";

  const seen = new Set<string>();
  const pushUrl = (url: string, size = 0) => {
    const clean = normalizeMediaUrl(url);
    if (!clean) return;
    const key = driveFileId(clean) || clean;
    if (seen.has(key)) return;
    seen.add(key);
    const name = clean.split("/").pop()?.split("?")[0] || clean;
    gallery.push({
      name,
      url: clean,
      size,
      isCover: Boolean(
        currentCover &&
          (mediaUrlsEqual(currentCover, clean) ||
            currentCover.includes(name) ||
            name.startsWith("cover_")),
      ),
    });
  };

  // 1) Metadata KV/Blob (producción)
  if (vehicle?.gallery?.length) {
    for (const url of vehicle.gallery) pushUrl(url);
  }
  if (currentCover) pushUrl(currentCover);

  // 2) Disco local (solo dev): agregar archivos que aún no estén en metadata
  if (existsSync(uploadDir)) {
    try {
      const files = await readdir(uploadDir);
      for (const file of files) {
        if (!/\.(jpg|jpeg|png|webp|avif)$/i.test(file)) continue;
        const filePath = join(uploadDir, file);
        const st = await stat(filePath);
        pushUrl(`/cars/uploads/${slug}/${file}`, st.size);
      }
    } catch {
      /* noop */
    }
  }

  // Portada primero si está en la lista
  if (currentCover && gallery.length > 1) {
    gallery.sort((a, b) => {
      const aCover = mediaUrlsEqual(a.url, currentCover) || a.isCover ? 0 : 1;
      const bCover = mediaUrlsEqual(b.url, currentCover) || b.isCover ? 0 : 1;
      if (aCover !== bCover) return aCover - bCover;
      return 0;
    });
    // Respetar orden de vehicle.gallery si existe
    if (vehicle?.gallery?.length) {
      const orderMap = new Map<string, number>();
      vehicle.gallery.forEach((url, idx) => {
        const key = driveFileId(url) || normalizeMediaUrl(url);
        orderMap.set(key, idx);
      });
      gallery.sort((a, b) => {
        const ka = driveFileId(a.url) || a.url;
        const kb = driveFileId(b.url) || b.url;
        const ia = orderMap.has(ka) ? orderMap.get(ka)! : 999;
        const ib = orderMap.has(kb) ? orderMap.get(kb)! : 999;
        if (ia !== ib) return ia - ib;
        if (mediaUrlsEqual(a.url, currentCover)) return -1;
        if (mediaUrlsEqual(b.url, currentCover)) return 1;
        return 0;
      });
    }
  }

  if (existsSync(spinDir)) {
    try {
      const files = (await readdir(spinDir)).filter((f) => /^\d+\.jpg$/i.test(f));
      spinCount = files.length;
    } catch {
      /* noop */
    }
  }
  if (!spinCount && vehicle?.spin?.count) {
    spinCount = vehicle.spin.count;
  }

  return NextResponse.json(
    {
      slug,
      gallery,
      spinCount,
      coverImage: currentCover,
      orderedGalleryUrls: gallery.map((g) => g.url),
      storage: isBlobReady() ? "blob" : "local",
    },
    {
      headers: {
        // Admin necesita ver fotos recién subidas; no cachear en edge
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}

/**
 * Sube una o múltiples fotos para un vehículo (galería, portada o fotogramas 360°).
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (isVercelProduction() && !isBlobReady()) {
    return NextResponse.json(
      {
        error:
          "Falta BLOB_READ_WRITE_TOKEN en Vercel. Sin Blob no se pueden guardar fotos en producción.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo leer el formulario (archivo demasiado grande o request inválido). Sube de a una foto bajo 3 MB.",
      },
      { status: 400 },
    );
  }

  const slug = String(form.get("slug") || "").trim();
  const type = String(form.get("type") || "gallery").trim(); // 'gallery' | 'cover' | 'spin'

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "Slug de vehículo no válido." }, { status: 400 });
  }

  const vehicle = await getVehicleBySlug(slug, { bypassCache: true });
  if (!vehicle) {
    return NextResponse.json(
      { error: `No existe el vehículo «${slug}». Elige una unidad del inventario.` },
      { status: 404 },
    );
  }

  const rawFiles = form.getAll("files").filter((f): f is File => f instanceof File);
  if (rawFiles.length === 0) {
    return NextResponse.json({ error: "No se seleccionaron archivos para subir." }, { status: 400 });
  }
  if (rawFiles.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Máximo ${MAX_FILES_PER_REQUEST} archivos por request. Sube el resto en otro lote.` },
      { status: 400 },
    );
  }

  for (const file of rawFiles) {
    if (!file.size || file.size < 32) {
      return NextResponse.json(
        { error: `«${file.name || "archivo"}» está vacío o corrupto.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `«${file.name}» pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo ~${(MAX_FILE_BYTES / 1024 / 1024).toFixed(1)} MB por foto.`,
        },
        { status: 413 },
      );
    }
    if (!isAllowedImage(file)) {
      return NextResponse.json(
        { error: `«${file.name}» no es una imagen permitida (JPG, PNG, WebP o HEIC de iPhone).` },
        { status: 400 },
      );
    }
  }

  const savedFiles: string[] = [];

  try {
    if (type === "spin") {
      const sorted = [...rawFiles].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      const publicUrls: string[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const file = sorted[i]!;
        const num = String(i + 1).padStart(3, "0");
        const prepared = await fileToStoredBytes(file);
        const relativePath = `cars/spin/${slug}/${num}.${prepared.ext}`;
        const stored = await storeMediaFile({
          bytes: prepared.bytes,
          relativePath,
          contentType: prepared.contentType,
        });
        publicUrls.push(publicMediaUrl(stored));
        savedFiles.push(stored.relativePath);
      }

      const manifest = {
        slug,
        count: sorted.length,
        updatedAt: new Date().toISOString(),
        manualUpload: true,
        storage: isBlobReady() ? "blob" : "local",
        frames: publicUrls,
      };
      const manifestStored = await storeMediaFile({
        bytes: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
        relativePath: `cars/spin/${slug}/manifest.json`,
        contentType: "application/json",
      });
      if (manifestStored.storage !== "local") {
        try {
          const spinDir = join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "spin", slug);
          await mkdir(spinDir, { recursive: true });
          await writeFile(join(spinDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
        } catch {
          /* noop */
        }
      }

      const saved = await saveVehicle({
        ...vehicle,
        spin: {
          count: sorted.length,
          pattern: publicUrls[0]?.includes("blob.vercel")
            ? publicUrls[0].replace(/001\.[a-z]+$/i, "{index}.jpg")
            : `/cars/spin/${slug}/{index}.jpg`,
          ext: "jpg",
        },
      });
      if (!saved.success) {
        return NextResponse.json(
          { error: saved.error || "Fotos 360 subidas pero no se actualizó el inventario." },
          { status: 500 },
        );
      }
    } else {
      const newPaths: string[] = [];

      for (const file of rawFiles) {
        const prepared = await fileToStoredBytes(file);
        const baseName =
          file.name
            .replace(/\.[^/.]+$/, "")
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "_")
            .slice(0, 30) || "photo";

        const prefix = type === "cover" ? "cover_" : "";
        const filename = `${prefix}${Date.now()}_${baseName}.${prepared.ext}`;
        const relativePath = `cars/uploads/${slug}/${filename}`;
        const stored = await storeMediaFile({
          bytes: prepared.bytes,
          relativePath,
          contentType: prepared.contentType,
        });
        savedFiles.push(filename);
        newPaths.push(publicMediaUrl(stored));
      }

      // Releer fresco por si otra subida concurrente ya escribió
      const fresh = (await getVehicleBySlug(slug, { bypassCache: true })) || vehicle;
      const currentGallery = Array.isArray(fresh.gallery) ? [...fresh.gallery] : [];
      const updatedGallery = [...currentGallery, ...newPaths];

      let updatedImage = fresh.image;
      if (type === "cover" || !updatedImage || updatedImage.includes("placeholder")) {
        updatedImage = newPaths[0] || updatedImage;
      }

      const saved = await saveVehicle({
        ...fresh,
        image: updatedImage,
        gallery: updatedGallery,
        hasRealPhotos: true,
      });
      if (!saved.success) {
        return NextResponse.json(
          {
            error:
              saved.error ||
              "Las fotos se subieron al storage pero falló guardar el inventario. Reintenta; no subas el mismo lote de nuevo sin revisar.",
            saved: savedFiles,
            urls: newPaths,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      count: savedFiles.length,
      saved: savedFiles,
      storage: isBlobReady() ? "blob" : "local",
      message: `Se ${savedFiles.length === 1 ? "subió 1 foto" : `subieron ${savedFiles.length} fotos`} con éxito.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al guardar archivos en el servidor.";
    console.error("[api/photos POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Modifica el orden de la galería o la foto de portada de un vehículo.
 */
export async function PUT(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { slug, action, coverUrl, gallery } = body;

    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      return NextResponse.json({ error: "Slug no válido." }, { status: 400 });
    }

    const v = await getVehicleBySlug(slug, { bypassCache: true });
    if (!v) {
      return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });
    }

    if (action === "set_cover" && coverUrl) {
      // Drive: conservar ?id= — si se corta, el próximo sync vuelve a gallery[0]
      const cleanUrl = normalizeMediaUrl(String(coverUrl));

      let currentGallery = (v.gallery || []).map(normalizeMediaUrl);
      const already = currentGallery.some((u) => mediaUrlsEqual(u, cleanUrl));
      if (!already) {
        currentGallery.unshift(cleanUrl);
      } else {
        currentGallery = [
          cleanUrl,
          ...currentGallery.filter((u) => !mediaUrlsEqual(u, cleanUrl)),
        ];
      }

      const saved = await saveVehicle({
        ...v,
        image: cleanUrl,
        gallery: currentGallery,
        hasRealPhotos: true,
        coverLocked: true,
      });
      if (!saved.success) {
        return NextResponse.json({ error: saved.error || "No se pudo guardar la portada." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Foto de portada actualizada correctamente.",
        coverImage: cleanUrl,
      });
    }

    if (action === "reorder" && Array.isArray(gallery)) {
      const cleanGallery = gallery.map((u: string) => normalizeMediaUrl(String(u)));
      const newCover = cleanGallery.length > 0 ? cleanGallery[0]! : v.image;

      const saved = await saveVehicle({
        ...v,
        image: newCover,
        gallery: cleanGallery,
        hasRealPhotos: cleanGallery.length > 0,
        coverLocked: true,
      });
      if (!saved.success) {
        return NextResponse.json({ error: saved.error || "No se pudo guardar el orden." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Orden de la galería actualizado correctamente.",
        gallery: cleanGallery,
      });
    }

    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar multimedia." },
      { status: 500 },
    );
  }
}

/**
 * Elimina una foto de la galería del vehículo.
 */
export async function DELETE(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { slug, filename, type = "gallery" } = body;

    if (!slug || !filename || !/^[a-z0-9-]+$/i.test(slug)) {
      return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
    }

    const safeFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, "");
    const isSpin = type === "spin";
    const targetDir = isSpin
      ? join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "spin", slug)
      : join(/*turbopackIgnore: true*/ process.cwd(), "public", "cars", "uploads", slug);

    const targetFile = join(targetDir, safeFilename);

    if (existsSync(targetFile)) {
      await unlink(targetFile);
    }

    const v = await getVehicleBySlug(slug, { bypassCache: true });
    if (v && !isSpin) {
      const currentGallery = v.gallery || [];
      const urlHint =
        typeof body.url === "string" ? normalizeMediaUrl(body.url) : "";
      const updatedGallery = currentGallery.filter((u) => {
        if (urlHint && mediaUrlsEqual(u, urlHint)) return false;
        return !u.includes(safeFilename);
      });

      let updatedImage = v.image;
      if (
        updatedImage.includes(safeFilename) ||
        (urlHint && mediaUrlsEqual(updatedImage, urlHint))
      ) {
        updatedImage =
          updatedGallery.length > 0 ? updatedGallery[0]! : "/images/placeholder-pending-car.svg";
      }

      const saved = await saveVehicle({
        ...v,
        image: updatedImage,
        gallery: updatedGallery,
        hasRealPhotos: updatedGallery.length > 0,
        coverLocked: updatedGallery.length > 0 ? v.coverLocked : false,
      });
      if (!saved.success) {
        return NextResponse.json(
          { error: saved.error || "Archivo borrado en disco pero falló actualizar inventario." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true, message: "Foto eliminada correctamente." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar la foto." },
      { status: 500 },
    );
  }
}
