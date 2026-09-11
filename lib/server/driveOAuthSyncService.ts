import type { Vehicle } from "@/lib/vehicles";
import {
  orderGalleryWithCover,
  resolveCoverFromGallery,
} from "@/lib/vehicles/frontCoverMap";
import { readJson, writeJson } from "@/lib/server/db";
import { storeMediaFile } from "@/lib/server/mediaStorage";
import { convertHeicToJpegBuffer, isHeicFile } from "@/lib/server/convertHeic";
import { getVehicles, saveVehicle } from "@/lib/server/vehiclesStore";
import {
  driveFileNeedsSync,
  folderMatchesVehiclePlate,
  normalizePlateKey,
  prioritizeVehiclesForDriveSync,
  type CachedDriveFile,
} from "@/lib/server/drivePlateMatch";
import {
  downloadDriveFileBytes,
  findPlateFolderByName,
  getDrivePhotosFolderId,
  isGoogleDriveOAuthConfigured,
  listImagesInFolder,
  type DriveImageRef,
} from "@/lib/server/googleDriveClient";

export type SyncResult = {
  success: boolean;
  totalFolders: number;
  syncedVehicles: number;
  newPhotosDownloaded: number;
  message: string;
  vehicles: Vehicle[];
};

const STATE_FILENAME = "drive-photos-sync-state.json";
/** Hobby + CDN ~60s: 2 autos/corrida es seguro con descarga+Blob. */
export const MAX_VEHICLES_PER_DRIVE_SYNC_RUN = 2;
const MAX_PHOTOS_PER_VEHICLE = 8;
/** Cuántos vehículos del stock priorizados intentar emparejar por nombre. */
const MAX_CANDIDATES_TO_INSPECT = 6;

export type DrivePhotosSyncState = {
  lastRunAt: string | null;
  /** fileId Drive → metadatos Blob */
  files: Record<string, CachedDriveFile>;
};

const EMPTY_STATE: DrivePhotosSyncState = {
  lastRunAt: null,
  files: {},
};

export async function loadDrivePhotosSyncState(): Promise<DrivePhotosSyncState> {
  const raw = await readJson<DrivePhotosSyncState>(STATE_FILENAME, EMPTY_STATE);
  return {
    lastRunAt: raw.lastRunAt ?? null,
    files: raw.files && typeof raw.files === "object" ? raw.files : {},
  };
}

export async function saveDrivePhotosSyncState(
  state: DrivePhotosSyncState,
): Promise<void> {
  await writeJson(STATE_FILENAME, state);
}

function extForImage(name: string, mime: string): string {
  if (isHeicFile(name, mime)) return "jpg";
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName) && fromName !== "heic" && fromName !== "heif") {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (/png/i.test(mime)) return "png";
  if (/webp/i.test(mime)) return "webp";
  if (/gif/i.test(mime)) return "gif";
  return "jpg";
}

async function materializeImageBytes(
  image: DriveImageRef,
): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  const raw = await downloadDriveFileBytes(image.id);
  if (isHeicFile(image.name, image.mimeType)) {
    const converted = await convertHeicToJpegBuffer(raw);
    return {
      bytes: converted.buffer,
      contentType: converted.contentType,
      ext: converted.ext,
    };
  }
  const ext = extForImage(image.name, image.mimeType);
  const contentType =
    image.mimeType?.startsWith("image/") && !/heic|heif/i.test(image.mimeType)
      ? image.mimeType
      : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return { bytes: raw, contentType, ext };
}

type FolderCandidate = {
  vehicle: Vehicle;
  folderId: string;
  folderName: string;
  images: DriveImageRef[];
  needsWork: boolean;
};

/**
 * Sync autenticado: Drive (cuenta U) → Vercel Blob → KV.
 * Incremental + tope por corrida para caber en maxDuration Hobby.
 */
export async function syncDrivePhotosViaOAuth(opts?: {
  maxVehicles?: number;
  folderId?: string;
}): Promise<SyncResult> {
  const existingList = await getVehicles();

  if (!isGoogleDriveOAuthConfigured()) {
    const msg =
      "Google Drive OAuth no configurado. Definí GOOGLE_DRIVE_CLIENT_ID, " +
      "GOOGLE_DRIVE_CLIENT_SECRET y GOOGLE_DRIVE_REFRESH_TOKEN (script scripts/google-drive-oauth-setup.mjs). " +
      "La carpeta de fotos está restringida: el scrape público ya no es el camino principal.";
    console.error(`[DriveOAuthSync] ${msg}`);
    return {
      success: false,
      totalFolders: 0,
      syncedVehicles: 0,
      newPhotosDownloaded: 0,
      message: msg,
      vehicles: existingList,
    };
  }

  const rootId = opts?.folderId || getDrivePhotosFolderId();
  const maxVehicles = opts?.maxVehicles ?? MAX_VEHICLES_PER_DRIVE_SYNC_RUN;
  const state = await loadDrivePhotosSyncState();

  // Priorizar sin fotos reales; buscar carpeta por nombre (sin listar las 100+).
  const prioritized = prioritizeVehiclesForDriveSync(
    existingList.filter((v) => normalizePlateKey(v.plate || "")),
  );
  const inspectQueue = prioritized.slice(0, MAX_CANDIDATES_TO_INSPECT);
  const toProcess: FolderCandidate[] = [];
  let foldersFound = 0;

  for (const vehicle of inspectQueue) {
    if (toProcess.length >= maxVehicles) break;

    const key = normalizePlateKey(vehicle.plate || "");
    let folder;
    try {
      folder = await findPlateFolderByName(key, rootId);
    } catch (err) {
      console.warn(
        `[DriveOAuthSync] Busqueda carpeta ${key}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    if (!folder) continue;
    foldersFound += 1;
    if (!folderMatchesVehiclePlate(folder.name, vehicle.plate)) continue;

    let images: DriveImageRef[] = [];
    try {
      images = await listImagesInFolder(folder.id);
    } catch (err) {
      console.warn(
        `[DriveOAuthSync] No se listaron fotos de ${folder.name}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    if (images.length === 0) continue;

    const limited = images.slice(0, MAX_PHOTOS_PER_VEHICLE);
    const needsWork =
      !vehicle.hasRealPhotos ||
      limited.some((img) => driveFileNeedsSync(img, state.files[img.id]));
    if (!needsWork) continue;

    toProcess.push({
      vehicle,
      folderId: folder.id,
      folderName: folder.name,
      images: limited,
      needsWork: true,
    });
  }

  if (foldersFound === 0 && toProcess.length === 0) {
    const msg =
      "Drive OAuth OK pero no se encontró carpeta de patente para el lote priorizado. " +
      "Revisá DRIVE_PHOTOS_FOLDER_ID y que la cuenta del refresh token vea FOTOS RG/UNIDADES.";
    console.error(`[DriveOAuthSync] ${msg}`);
    return {
      success: false,
      totalFolders: 0,
      syncedVehicles: 0,
      newPhotosDownloaded: 0,
      message: msg,
      vehicles: existingList,
    };
  }

  let newPhotos = 0;
  let synced = 0;

  for (const item of toProcess) {
    const galleryUrls: string[] = [];
    let uploadedThisVehicle = 0;

    for (const image of item.images) {
      const cached = state.files[image.id];
      if (!driveFileNeedsSync(image, cached) && cached?.blobUrl) {
        galleryUrls.push(cached.blobUrl);
        continue;
      }

      try {
        const { bytes, contentType, ext } = await materializeImageBytes(image);
        const relativePath = `cars/uploads/${item.vehicle.slug}/${image.id}.${ext}`;
        const stored = await storeMediaFile({
          bytes,
          relativePath,
          contentType,
        });
        state.files[image.id] = {
          modifiedTime: image.modifiedTime,
          blobUrl: stored.url,
          plate: normalizePlateKey(item.vehicle.plate || item.folderName),
        };
        galleryUrls.push(stored.url);
        uploadedThisVehicle += 1;
        newPhotos += 1;
      } catch (err) {
        console.warn(
          `[DriveOAuthSync] Falló foto ${image.name} (${image.id}):`,
          err instanceof Error ? err.message : err,
        );
        if (cached?.blobUrl) galleryUrls.push(cached.blobUrl);
      }
    }

    if (galleryUrls.length === 0) continue;

    const cover = resolveCoverFromGallery(item.vehicle.image, galleryUrls);
    const orderedGallery = orderGalleryWithCover(cover, galleryUrls);
    const vehicle: Vehicle = {
      ...item.vehicle,
      hasRealPhotos: true,
      gallery: orderedGallery,
      image: cover || orderedGallery[0],
    };
    await saveVehicle(vehicle);
    synced += 1;
    // Checkpoint por vehículo: si el cron corta a los 60s, no se pierde el progreso.
    state.lastRunAt = new Date().toISOString();
    await saveDrivePhotosSyncState(state);
    console.log(
      `[DriveOAuthSync] ${item.folderName} → ${item.vehicle.slug}: ${galleryUrls.length} fotos (${uploadedThisVehicle} nuevas)`,
    );
  }

  state.lastRunAt = new Date().toISOString();
  await saveDrivePhotosSyncState(state);

  const remainingLikely = Math.max(
    0,
    prioritized.filter((v) => !v.hasRealPhotos).length - synced,
  );
  const pendingNote =
    remainingLikely > 0
      ? ` Quedan ~${remainingLikely} sin fotos reales para próximas corridas (tope ${maxVehicles}/run).`
      : "";

  const updatedList = await getVehicles();
  return {
    success: true,
    totalFolders: foldersFound,
    syncedVehicles: synced,
    newPhotosDownloaded: newPhotos,
    message:
      `Drive OAuth→Blob: ${synced} vehículos actualizados, ${newPhotos} fotos nuevas ` +
      `(${foldersFound} carpetas halladas en este lote, ${prioritized.length} en stock).` +
      pendingNote,
    vehicles: updatedList,
  };
}
