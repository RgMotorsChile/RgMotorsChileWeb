import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getVehicles, saveVehicle } from "@/lib/server/vehiclesStore";
import { requireAdminSession } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Escanea la carpeta public/cars/uploads/ para detectar fotos agregadas manualmente
 * en el sistema de archivos (por patente o por slug) y asignarlas a los vehículos.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const uploadsBase = join(process.cwd(), "public", "cars", "uploads");
    if (!existsSync(uploadsBase)) {
      return NextResponse.json({ success: true, count: 0, message: "La carpeta de uploads aún no existe." });
    }

    const dirEntries = await readdir(uploadsBase, { withFileTypes: true });
    const subDirs = dirEntries.filter((d) => d.isDirectory()).map((d) => d.name);

    if (subDirs.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No se encontraron subcarpetas en uploads." });
    }

    const allVehicles = await getVehicles({ scope: "staff" });
    let updatedCount = 0;

    for (const folderName of subDirs) {
      // Buscar vehículo por slug exacto o por patente limpia
      const cleanFolder = folderName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const targetVehicle = allVehicles.find((v) => {
        if (v.slug.toLowerCase() === folderName.toLowerCase()) return true;
        const vPlate = (v.plate || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        return vPlate && vPlate === cleanFolder;
      });

      if (!targetVehicle) continue;

      const folderPath = join(uploadsBase, folderName);
      const files = await readdir(folderPath);
      const imageFiles = files
        .filter((f) => /\.(jpg|jpeg|png|webp|avif)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (imageFiles.length > 0) {
        const galleryUrls = imageFiles.map((f) => `/cars/uploads/${folderName}/${f}`);
        // Portada: si hay archivo que empieza con "cover_" o el primero
        const coverFile = imageFiles.find((f) => f.toLowerCase().startsWith("cover_")) || imageFiles[0];
        const coverUrl = `/cars/uploads/${folderName}/${coverFile}`;

        await saveVehicle({
          ...targetVehicle,
          image: coverUrl,
          gallery: galleryUrls,
          hasRealPhotos: true,
        });

        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Se sincronizaron fotos para ${updatedCount} vehículos exitosamente desde las carpetas locales.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al sincronizar carpetas locales." },
      { status: 500 }
    );
  }
}
