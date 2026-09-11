import { syncCatalogFromDriveFolders } from "./driveSyncService";
import {
  DEFAULT_DRIVE_PHOTOS_FOLDER_ID,
  getDrivePhotosFolderId,
  isGoogleDriveOAuthConfigured,
} from "./googleDriveClient";

const DEFAULT_DRIVE_URLS = [
  `https://drive.google.com/drive/folders/${DEFAULT_DRIVE_PHOTOS_FOLDER_ID}?usp=sharing`,
];

const SYNC_INTERVAL_MS = 60 * 60 * 1000;

let isSyncing = false;
let lastSyncTime: Date | null = null;

export async function runAutoSync(): Promise<{ success: boolean; message: string }> {
  if (isSyncing) {
    return { success: false, message: "Una sincronización ya está en curso." };
  }

  isSyncing = true;
  const mode = isGoogleDriveOAuthConfigured()
    ? "OAuth → Blob"
    : "scrape HTML (legacy)";
  console.log(
    `[AutoSync] [${new Date().toISOString()}] Iniciando sync Drive (${mode}), folder=${getDrivePhotosFolderId()}...`,
  );

  try {
    const result = await syncCatalogFromDriveFolders(DEFAULT_DRIVE_URLS);
    lastSyncTime = new Date();
    if (!result.success) {
      console.error(`[AutoSync] ${result.message}`);
      return { success: false, message: result.message };
    }
    console.log(
      `[AutoSync] OK: ${result.syncedVehicles} vehículos, ${result.newPhotosDownloaded} fotos nuevas.`,
    );
    return {
      success: true,
      message: result.message,
      syncedVehicles: result.syncedVehicles,
      newPhotosDownloaded: result.newPhotosDownloaded,
      totalFolders: result.totalFolders,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("[AutoSync] Error durante la sincronización automática:", msg);
    return { success: false, message: msg };
  } finally {
    isSyncing = false;
  }
}

export function startAutoSyncScheduler() {
  console.log(
    "[AutoSync] El programador local ha sido desactivado a favor de Vercel Cron Jobs.",
  );
}

export function getAutoSyncStatus() {
  return {
    isSyncing,
    lastSyncTime: lastSyncTime ? lastSyncTime.toISOString() : null,
    intervalMinutes: SYNC_INTERVAL_MS / 60000,
    foldersConfigured: DEFAULT_DRIVE_URLS.length,
    driveFolderId: getDrivePhotosFolderId(),
    oauthConfigured: isGoogleDriveOAuthConfigured(),
    mode: isGoogleDriveOAuthConfigured()
      ? "OAuth readonly → Vercel Blob"
      : "Legacy HTML scrape (requiere carpeta pública o configurar OAuth)",
  };
}
