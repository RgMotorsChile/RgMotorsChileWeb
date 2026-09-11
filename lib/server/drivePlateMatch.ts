/**
 * Matching de patentes Drive ↔ stock y decisión de resync incremental.
 * Sin I/O ni Google — testeable en isolation.
 */

export function normalizePlateKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Variantes de nombre de carpeta a probar en Drive.
 * En Drive casi siempre está junta (RZVL18); en stock suele venir con espacio (RZVL 18).
 */
export function plateFolderNameVariants(plate: string): string[] {
  const compact = String(plate || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (!compact) return [];

  const out = new Set<string>([compact, compact.toLowerCase()]);

  const pushSplit = (left: number) => {
    if (left <= 0 || left >= compact.length) return;
    const a = compact.slice(0, left);
    const b = compact.slice(left);
    out.add(`${a} ${b}`);
    out.add(`${a}-${b}`);
    out.add(`${a}_${b}`);
    out.add(`${a.toLowerCase()} ${b.toLowerCase()}`);
  };

  // Patentes Chile típicas: 4+2, 2+4, 3+3
  if (/^[A-Z]{4}\d{2}$/.test(compact)) pushSplit(4);
  if (/^[A-Z]{2}\d{4}$/.test(compact)) pushSplit(2);
  if (/^[A-Z]{3}\d{3}$/.test(compact)) pushSplit(3);
  // Por si el formato no matchea regex, igual probar corte letras/números
  const m = compact.match(/^([A-Z]+)(\d+)$/);
  if (m) pushSplit(m[1].length);

  return [...out];
}

/** Prefijos para `name contains` cuando el exact match falla. */
export function plateFolderSearchPrefixes(plate: string): string[] {
  const compact = String(plate || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (!compact) return [];
  const prefs = new Set<string>([compact]);
  const letters = compact.match(/^[A-Z]+/)?.[0] || "";
  if (letters.length >= 2) prefs.add(letters);
  if (letters.length >= 4) prefs.add(letters.slice(0, 4));
  if (compact.length >= 4) prefs.add(compact.slice(0, 4));
  return [...prefs];
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

/**
 * Elige la mejor carpeta candidata cuyo nombre normalizado == patente.
 * Preferí nombre exactamente compacto (RZVL18) sobre variantes con espacio.
 */
export function pickBestPlateFolder<T extends { name: string }>(
  plate: string,
  folders: T[],
): T | null {
  const key = normalizePlateKey(plate);
  if (!key) return null;
  const matches = folders.filter((f) => normalizePlateKey(f.name) === key);
  if (!matches.length) return null;
  const compact = key.toUpperCase();
  const exact = matches.find((f) => {
    const raw = String(f.name || "");
    const onlyAlnum = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return onlyAlnum === compact && !/[\s\-_]/.test(raw);
  });
  return exact || matches[0];
}

/**
 * Índice patente normalizada → carpeta Drive.
 * Usa el nombre completo de carpeta (RZVL18) sin importar espacios en el stock.
 */
export function buildPlateFolderIndex(
  folders: Array<{ id: string; name: string }>,
): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  for (const f of folders) {
    const key = normalizePlateKey(f.name);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, f);
      continue;
    }
    // Preferí nombre sin espacios/guiones (formato Drive típico)
    const preferNew =
      !/[\s\-_]/.test(f.name) && /[\s\-_]/.test(prev.name);
    if (preferNew) map.set(key, f);
  }
  return map;
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
