import { NextResponse } from "next/server";
import { CATALOG_AUTOMATION_STATUS, catalogAutomationDisabledBody } from "@/lib/server/catalogAutomation";
import { getVehicles } from "@/lib/server/vehiclesStore";
import { getAutoSyncStatus } from "@/lib/server/autoSyncScheduler";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import {
  DEFAULT_DRIVE_PHOTOS_FOLDER_ID,
  getDrivePhotosFolderId,
  isGoogleDriveOAuthConfigured,
} from "@/lib/server/googleDriveClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DRIVE_URLS = [
  `https://drive.google.com/drive/folders/${DEFAULT_DRIVE_PHOTOS_FOLDER_ID}?usp=sharing`,
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const list = await getVehicles({ scope: "staff" });
    return NextResponse.json({
      connectedFolders: DEFAULT_DRIVE_URLS,
      driveFolderId: getDrivePhotosFolderId(),
      oauthConfigured: isGoogleDriveOAuthConfigured(),
      autoSync: getAutoSyncStatus(),
      totalVehicles: list.length,
      vehicles: list,
      disabled: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener estado de sincronizacion." },
      { status: 500 },
    );
  }
}

export async function POST() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(catalogAutomationDisabledBody(), { status: CATALOG_AUTOMATION_STATUS });
}
