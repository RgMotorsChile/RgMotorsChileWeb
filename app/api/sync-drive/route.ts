import { NextRequest, NextResponse } from "next/server";
import { syncCatalogFromDriveFolders, parseExcelStockBuffer } from "@/lib/server/driveSyncService";
import { saveVehicle, getVehicles } from "@/lib/server/vehiclesStore";
import { startAutoSyncScheduler, getAutoSyncStatus } from "@/lib/server/autoSyncScheduler";
import { Vehicle } from "@/lib/vehicles";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import {
  DEFAULT_DRIVE_PHOTOS_FOLDER_ID,
  getDrivePhotosFolderId,
  isGoogleDriveOAuthConfigured,
} from "@/lib/server/googleDriveClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

startAutoSyncScheduler();

const DEFAULT_DRIVE_URLS = [
  `https://drive.google.com/drive/folders/${DEFAULT_DRIVE_PHOTOS_FOLDER_ID}?usp=sharing`,
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const list = await getVehicles();
    return NextResponse.json({
      connectedFolders: DEFAULT_DRIVE_URLS,
      driveFolderId: getDrivePhotosFolderId(),
      oauthConfigured: isGoogleDriveOAuthConfigured(),
      autoSync: getAutoSyncStatus(),
      totalVehicles: list.length,
      vehicles: list,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener estado de sincronización." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const contentType = req.headers.get("content-type") || "";

    // Si viene un archivo Excel (FormData)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No se subió ningún archivo Excel." }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const rows = await parseExcelStockBuffer(buffer);

      const existingVehicles = await getVehicles();
      const existingMap = new Map(existingVehicles.map(v => [v.plate?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(), v]));

      let imported = 0;
      for (const r of rows) {
        const rawPlate = String(r.rawPlate || r.plate || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (!rawPlate) continue;

        const existing = existingMap.get(rawPlate);

        const slug = existing?.slug || `${r.brand.toLowerCase()}-${r.model.toLowerCase()}-${r.year}-${rawPlate.toLowerCase()}`
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        const vehicle: Vehicle = {
          ...(existing || {}),
          slug,
          plate: r.plate || `${rawPlate.slice(0, 4)} ${rawPlate.slice(4)}`,
          brand: r.brand || "Vehículo",
          model: r.model || "Modelo",
          version: existing?.version || `${r.model} · ${r.color || "Blanco"}`,
          year: r.year || 2022,
          price: r.price > 0 ? r.price : (existing?.price || 0),
          listPrice: r.listPrice || existing?.listPrice,
          km: r.km > 0 ? r.km : (existing?.km || 0),
          fuel: existing?.fuel || "Diésel",
          transmission: existing?.transmission || "Manual",
          bodyType: existing?.bodyType || "Camioneta",
          location: r.location || existing?.location || "Puerto Montt · Av. El Tepual (Ex Banco de Chile)",
          image: existing?.image || "/images/placeholder-pending-car.svg",
          gallery: existing?.gallery || [],
          hasRealPhotos: existing?.hasRealPhotos || false,
          supplier: r.supplier || existing?.supplier || "RG Motors",
          engine: existing?.engine || "2.4L",
          power: existing?.power || "150 HP",
          traction: existing?.traction || "4x4",
          doors: 4,
          owners: 1,
          featured: r.brand === "Toyota" || r.brand === "Mitsubishi",
          status: existing?.status || "Disponible",
          highlights: existing?.highlights || [
            "Inspección mecánica rigurosa de 150 puntos",
            "Documentación y transferencia al día",
          ],
        };

        await saveVehicle(vehicle);
        imported++;
      }

      return NextResponse.json({
        success: true,
        message: `Se importaron/actualizaron ${imported} vehículos exclusivamente de la hoja RG MOTORS (con precio y km válidos).`,
        imported,
      });
    }

    // Sincronización normal desde Google Drive
    const body = await req.json().catch(() => ({}));
    const urls = body.folderUrls && Array.isArray(body.folderUrls) && body.folderUrls.length > 0
      ? body.folderUrls
      : DEFAULT_DRIVE_URLS;

    const result = await syncCatalogFromDriveFolders(urls);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al sincronizar con Google Drive." },
      { status: 500 }
    );
  }
}
