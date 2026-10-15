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

export type CachedDriveFolder = {
  modifiedTime?: string;
  /** Hash de id + modifiedTime de las imágenes ya sincronizadas. */
  contentHash?: string;
};

/**
 * Hash estable del contenido de una carpeta. Sirve para saltar la descarga
 * cuando Drive no trae modifiedTime de la carpeta o ese sello no cambió.
 */
export function folderContentHash(
  images: Array<{ id: string; modifiedTime?: string }>,
): string {
  const body = [...images]
    .map((img) => `${img.id}\t${img.modifiedTime || ""}`)
    .sort()
    .join("\n");
  let hash = 2166136261;
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * true si ya sincronizamos esta carpeta y su modifiedTime no avanzó.
 * Sin sello o sin modifiedTime hay que listar (el hash se compara después).
 */
export function folderStampIsCurrent(
  folder: { modifiedTime?: string },
  cached?: CachedDriveFolder | null,
): boolean {
  if (!cached?.contentHash) return false;
  if (!folder.modifiedTime || !cached.modifiedTime) return false;
  return folder.modifiedTime === cached.modifiedTime;
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
export function buildPlateFolderIndex<
  T extends { id: string; name: string; modifiedTime?: string },
>(folders: T[]): Map<string, T> {
  const map = new Map<string, T>();
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

/**
 * Rota la cola para no empezar siempre por el mismo auto.
 * `cursorPlate` es la patente por la que debe seguir la próxima corrida.
 */
export function rotateSyncQueue<T extends { plate?: string }>(
  vehicles: T[],
  cursorPlate: string | null | undefined,
): T[] {
  if (!cursorPlate || vehicles.length < 2) return vehicles;
  const cursor = normalizePlateKey(cursorPlate);
  const idx = vehicles.findIndex(
    (vehicle) => normalizePlateKey(vehicle.plate || "") === cursor,
  );
  if (idx <= 0) return vehicles;
  return [...vehicles.slice(idx), ...vehicles.slice(0, idx)];
}
