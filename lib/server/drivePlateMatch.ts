/**
 * Matching de patentes Drive ↔ stock y decisión de resync incremental.
 * Sin I/O ni Google — testeable en isolation.
 */

export function normalizePlateKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type DriveFileStamp = {
  id: string;
  modifiedTime?: string;
};

export type CachedDriveFile = {
  modifiedTime?: string;
  blobUrl?: string;
  plate?: string;
};

/** true si el archivo de Drive no está en Blob o cambió según modifiedTime. */
export function driveFileNeedsSync(
  file: DriveFileStamp,
  cached?: CachedDriveFile | null,
): boolean {
  if (!cached?.blobUrl) return true;
  if (!file.modifiedTime || !cached.modifiedTime) return true;
  return file.modifiedTime > cached.modifiedTime;
}

export function folderMatchesVehiclePlate(
  folderName: string,
  vehiclePlate: string | undefined,
): boolean {
  const folderKey = normalizePlateKey(folderName);
  const plateKey = normalizePlateKey(vehiclePlate || "");
  return Boolean(folderKey && plateKey && folderKey === plateKey);
}

export type SyncPriorityVehicle = {
  slug: string;
  plate?: string;
  hasRealPhotos?: boolean;
};

/**
 * Ordena candidatos: primero sin fotos reales, luego el resto (estable por slug).
 */
export function prioritizeVehiclesForDriveSync<T extends SyncPriorityVehicle>(
  vehicles: T[],
): T[] {
  return [...vehicles].sort((a, b) => {
    const aMissing = a.hasRealPhotos ? 1 : 0;
    const bMissing = b.hasRealPhotos ? 1 : 0;
    if (aMissing !== bMissing) return aMissing - bMissing;
    return String(a.slug).localeCompare(String(b.slug));
  });
}
