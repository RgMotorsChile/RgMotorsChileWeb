import type { Vehicle } from "@/lib/vehicles";
import {
  orderGalleryWithCover,
  resolveCoverFromGallery,
} from "@/lib/vehicles/frontCoverMap";
import { readJson, writeJson } from "@/lib/server/db";
import { storeMediaFile } from "@/lib/server/mediaStorage";
import { blobStillExists } from "@/lib/server/verifyPhotos";
import { convertHeicToJpegBuffer, isHeicFile } from "@/lib/server/convertHeic";
import { isHeicHeifOrDng } from "@/lib/server/driveImageFormats";
import { getVehicles, saveVehicle } from "@/lib/server/vehiclesStore";
import {
  DRIVE_FOLDER_STAMP_REVISION,
  driveFileNeedsSync,
  folderContentHash,
  folderMatchesVehiclePlate,
  folderStampIsCurrent,
  groupPlateFolders,
  normalizePlateKey,
  prioritizeVehiclesForDriveSync,
  rotateSyncQueue,
  type CachedDriveFile,
  type CachedDriveFolder,
} from "@/lib/server/drivePlateMatch";
import {
  downloadDriveFileBytes,
  downloadDriveRenderedJpeg,
  getDrivePhotosFolderId,
  isGoogleDriveOAuthConfigured,
  listImagesInFolder,
  listPlateFolders,
  type DriveImageRef,
} from "@/lib/server/googleDriveClient";

export type SyncResult = {
  success: boolean;
  totalFolders: number;
  syncedVehicles: number;
  newPhotosDownloaded: number;
  /** Blobs 404 cuyo archivo seguía en Drive y se volvieron a subir. */
  repairedPhotos?: number;
  message: string;
  vehicles: Vehicle[];
  skippedUnchanged?: number;
  skippedCoverLocked?: number;
  deferredVehicles?: number;
  errors?: string[];
};

const STATE_FILENAME = "drive-photos-sync-state.json";
/**
 * Hobby + maxDuration 60s.
 * La corrida de las 08:00 Chile (11:00 UTC) solo alcanzó 3 autos porque el tope
 * era 3 vehículos × 10 fotos: PFKX61 quedó en 9, DWJS66 en 10/14 y HLXB59 en
 * 10/12. El resto (JRTH26, TRBX87, KVGK53, SBZG55, SPXG35, LWRS59) ni se tocó.
 * No hay tope permanente de galería. El cupo es solo de descargas nuevas por
 * corrida; el plazo de 50s corta igual si una foto tarda. 12 por auto deja
 * terminar en una pasada un faltante de 6–12 (TCGB98, TRBX87). 36 por corrida
 * son 3 autos a cupo lleno y sigue cabiendo antes de los 60s de Hobby.
 */
export const MAX_VEHICLES_PER_DRIVE_SYNC_RUN = 12;
export const MAX_NEW_PHOTOS_PER_RUN = 36;
/**
 * Descargas nuevas por auto y corrida. No es un tamaño de galería:
 * las fotos ya guardadas se conservan y solo se agregan.
 */
export const PHOTOS_PER_VEHICLE_PER_RUN = 12;
/** Listados de imágenes por corrida. Una patente con dos carpetas gasta dos. */
export const MAX_FOLDER_LISTS_PER_RUN = 30;
/**
 * HEAD de blobs ya publicados por corrida. Una galería sellada no se vuelve a
 * bajar: sin este cupo los 404 (blob borrado) quedan para siempre.
 */
export const MAX_BLOB_HEAD_CHECKS_PER_RUN = 40;
/**
 * Con reposiciones ya detectadas, no seguir haciendo HEAD hasta agotar el
 * plazo: hay que dejar tiempo para re-subir dentro del presupuesto del cron.
 */
const BLOB_HEAD_DEADLINE_MARGIN_MS = 12_000;

export function drivePhotosSyncStateKey(tenantSlug: string): string {
  if (!tenantSlug || tenantSlug === "rg-motors") return STATE_FILENAME;
  return `drive-photos-sync-state.${tenantSlug}.json`;
}

export type DrivePhotosSyncState = {
  lastRunAt: string | null;
  /** fileId Drive → metadatos Blob */
  files: Record<string, CachedDriveFile>;
  /** folderId Drive → modifiedTime + hash del contenido ya sincronizado */
  folders: Record<string, CachedDriveFolder>;
  /** Patente normalizada por la que sigue la ronda de autos sin fotos. */
  zeroPhotoCursor?: string | null;
  /** Patente normalizada por la que sigue la revisión HEAD de blobs de galería. */
  blobCheckCursor?: string | null;
  /** URLs ya revisadas de blobCheckCursor. La siguiente corrida sigue desde ahí. */
  blobCheckOffset?: number;
};

const EMPTY_STATE: DrivePhotosSyncState = {
  lastRunAt: null,
  files: {},
  folders: {},
  zeroPhotoCursor: null,
  blobCheckCursor: null,
  blobCheckOffset: 0,
};

export async function loadDrivePhotosSyncState(
  tenantSlug = "rg-motors",
): Promise<DrivePhotosSyncState> {
  const raw = await readJson<DrivePhotosSyncState>(
    drivePhotosSyncStateKey(tenantSlug),
    EMPTY_STATE,
  );
  return {
    lastRunAt: raw.lastRunAt ?? null,
    files: raw.files && typeof raw.files === "object" ? raw.files : {},
    folders: raw.folders && typeof raw.folders === "object" ? raw.folders : {},
    zeroPhotoCursor:
      typeof raw.zeroPhotoCursor === "string" ? raw.zeroPhotoCursor : null,
    blobCheckCursor:
      typeof raw.blobCheckCursor === "string" ? raw.blobCheckCursor : null,
    blobCheckOffset:
      typeof raw.blobCheckOffset === "number" && raw.blobCheckOffset > 0
        ? Math.floor(raw.blobCheckOffset)
        : 0,
  };
}

export async function saveDrivePhotosSyncState(
  state: DrivePhotosSyncState,
  tenantSlug = "rg-motors",
): Promise<void> {
  await writeJson(drivePhotosSyncStateKey(tenantSlug), state);
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
  if (isHeicHeifOrDng(image.name, image.mimeType)) {
    try {
      const bytes = await downloadDriveRenderedJpeg(image.id, image.thumbnailLink);
      return { bytes, contentType: "image/jpeg", ext: "jpg" };
    } catch (renderErr) {
      if (!isHeicFile(image.name, image.mimeType)) throw renderErr;
      console.warn(
        `[DriveOAuthSync] Thumbnail de ${image.name} no sirvió; se intenta heic-decode:`,
        renderErr instanceof Error ? renderErr.message : renderErr,
      );
      const raw = await downloadDriveFileBytes(image.id);
      const converted = await convertHeicToJpegBuffer(raw);
      return {
        bytes: converted.buffer,
        contentType: converted.contentType,
        ext: converted.ext,
      };
    }
  }
  const raw = await downloadDriveFileBytes(image.id);
  const ext = extForImage(image.name, image.mimeType);
  const contentType =
    image.mimeType?.startsWith("image/") && !/heic|heif/i.test(image.mimeType)
      ? image.mimeType
      : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return { bytes: raw, contentType, ext };
}

function isStoredPhotoUrl(url: string | undefined): url is string {
  const value = url?.trim() || "";
  if (!value) return false;
  return !value.includes("placeholder");
}

/** El sync guarda `cars/uploads/{slug}/{driveFileId}.ext` (sin sufijo aleatorio). */
function fileIdFromStoredUrl(url: string): string | null {
  const path = url.split("?")[0];
  const base = path.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem || null;
}

/**
 * Si la galería ya apunta al archivo de Drive, se toma como caché.
 * Unidades Chile parte con un state propio vacío: sin esto el tope de
 * descargas nuevas vuelve a bajar las mismas fotos y pisa la galería.
 */
function adoptExistingPhotosIntoFileCache(
  vehicle: Vehicle,
  images: DriveImageRef[],
  state: DrivePhotosSyncState,
  plateKey: string,
): void {
  const byId = new Map<string, string>();
  for (const url of [...(vehicle.gallery || []), vehicle.image]) {
    if (!isStoredPhotoUrl(url)) continue;
    const id = fileIdFromStoredUrl(url);
    if (id && !byId.has(id)) byId.set(id, url);
  }
  for (const image of images) {
    const url = byId.get(image.id);
    if (!url) continue;
    if (state.files[image.id]?.blobUrl) continue;
    state.files[image.id] = {
      modifiedTime: image.modifiedTime,
      blobUrl: url,
      plate: plateKey,
    };
  }
}

/** Lo ya publicado va primero. Una corrida solo agrega URLs nuevas. */
function mergeGalleryKeepingExisting(
  existing: Array<string | undefined>,
  built: string[],
): string[] {
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const out: string[] = [];
  const push = (url: string | undefined) => {
    if (!isStoredPhotoUrl(url)) return;
    const id = fileIdFromStoredUrl(url);
    if (seen.has(url)) return;
    if (id && seenIds.has(id)) return;
    seen.add(url);
    if (id) seenIds.add(id);
    out.push(url);
  };
  for (const url of existing) push(url);
  for (const url of built) push(url);
  return out;
}

/** Portada primero: con el cupo de HEAD justo, el 404 de la portada se ve en esta corrida. */
function storedPhotoUrls(vehicle: Vehicle): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url?: string) => {
    if (!isStoredPhotoUrl(url) || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  push(vehicle.image);
  for (const url of vehicle.gallery || []) push(url);
  return out;
}

/**
 * Id de Drive de una URL ya publicada.
 * Primero el state (blobUrl → fileId); si no, el nombre del archivo
 * (`cars/uploads/{slug}/{driveFileId}.ext`).
 */
function resolveStoredDriveId(
  url: string | undefined,
  state: DrivePhotosSyncState,
): string | null {
  if (!isStoredPhotoUrl(url)) return null;
  for (const [id, file] of Object.entries(state.files)) {
    if (file.blobUrl === url) return id;
  }
  return fileIdFromStoredUrl(url);
}

function appendBrokenUrl(map: Map<string, string[]>, id: string, url: string): void {
  const list = map.get(id);
  if (!list) {
    map.set(id, [url]);
    return;
  }
  if (!list.includes(url)) list.push(url);
}

type BlobHeadBudget = {
  used: number;
  max: number;
  deadlineAt: number;
  /** Hay un 404 confirmado: reservar el final del plazo para re-subir. */
  reserveForUpload: boolean;
};

function blobHeadAllowed(budget: BlobHeadBudget): boolean {
  if (budget.used >= budget.max || Date.now() >= budget.deadlineAt) return false;
  if (
    budget.reserveForUpload &&
    Number.isFinite(budget.deadlineAt) &&
    budget.deadlineAt - Date.now() < BLOB_HEAD_DEADLINE_MARGIN_MS
  ) {
    return false;
  }
  return true;
}

/**
 * HEAD de cada URL de galería. Un 404/410/403 (blobStillExists) es un blob
 * perdido. Timeout u otro error cuentan como presente: no se toca la fila.
 */
async function galleryBlobsMissing(
  urls: string[],
  budget: BlobHeadBudget,
  known: Map<string, boolean>,
): Promise<{ missing: Set<string>; complete: boolean; checked: number }> {
  const missing = new Set<string>();
  let checked = 0;
  for (const url of urls) {
    if (!blobHeadAllowed(budget)) return { missing, complete: false, checked };
    checked += 1;
    let exists = known.get(url);
    if (exists === undefined) {
      budget.used += 1;
      exists = await blobStillExists(url);
      known.set(url, exists);
    }
    if (!exists) {
      missing.add(url);
      budget.reserveForUpload = true;
    }
  }
  return { missing, complete: true, checked };
}

type FolderWork = {
  folderId: string;
  folderName: string;
  folderModifiedTime?: string;
  contentHash: string;
  images: DriveImageRef[];
  /** URL 404 → archivo de Drive que sigue en la carpeta. */
  brokenUrlsByDriveId: Map<string, string[]>;
};

type FolderCandidate = {
  vehicle: Vehicle;
  folders: FolderWork[];
  /** Fotos de todas las carpetas de la patente, sin repetir id de Drive. */
  images: DriveImageRef[];
  brokenUrlsByDriveId: Map<string, string[]>;
  /** Si la portada era el blob roto, se re-sube ese mismo archivo. */
  brokenCoverDriveId?: string;
};

function stampDriveFolder(
  state: DrivePhotosSyncState,
  folderId: string,
  modifiedTime: string | undefined,
  contentHash: string,
): void {
  state.folders[folderId] = {
    modifiedTime,
    contentHash,
    revision: DRIVE_FOLDER_STAMP_REVISION,
  };
}

function driveImageRepresented(
  image: DriveImageRef,
  state: DrivePhotosSyncState,
  gallery: string[],
): boolean {
  const cached = state.files[image.id]?.blobUrl || "";
  if (cached && fileIdFromStoredUrl(cached) === image.id) return true;
  return gallery.some((url) => fileIdFromStoredUrl(url) === image.id);
}

/**
 * Sync autenticado: Drive (cuenta U) → Vercel Blob → KV.
 * Incremental + tope por corrida para caber en maxDuration Hobby.
 */
export async function syncDrivePhotosViaOAuth(opts?: {
  maxVehicles?: number;
  maxNewPhotos?: number;
  photosPerVehicle?: number;
  /** Epoch ms. Al pasarlo, la corrida deja el resto para la siguiente. */
  deadlineAt?: number;
  /** HEAD de blobs de galería por corrida. Por defecto MAX_BLOB_HEAD_CHECKS_PER_RUN. */
  maxBlobHeadChecks?: number;
  folderId?: string;
  tenantSlug?: string;
}): Promise<SyncResult> {
  const tenantSlug = opts?.tenantSlug || "rg-motors";
  const existingList = await getVehicles({
    tenantSlug,
    bypassCache: true,
    scope: "staff",
  });

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
  const maxNewPhotos = opts?.maxNewPhotos ?? MAX_NEW_PHOTOS_PER_RUN;
  const photosPerVehicle = opts?.photosPerVehicle ?? PHOTOS_PER_VEHICLE_PER_RUN;
  const deadlineAt = opts?.deadlineAt ?? Number.POSITIVE_INFINITY;
  const maxBlobHeadChecks = opts?.maxBlobHeadChecks ?? MAX_BLOB_HEAD_CHECKS_PER_RUN;
  const state = await loadDrivePhotosSyncState(tenantSlug);
  const errors: string[] = [];

  // 1) Listar TODAS las carpetas de patente una vez y matchear por clave normalizada
  //    (RZVL 18 en Excel ≡ RZVL18 en Drive). Evita fallos de name= / contains.
  let folders;
  try {
    folders = await listPlateFolders(rootId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const msg = `No se pudieron listar carpetas de Drive (${rootId}): ${detail}`;
    console.error(`[DriveOAuthSync] ${msg}`);
    return {
      success: false,
      totalFolders: 0,
      syncedVehicles: 0,
      newPhotosDownloaded: 0,
      message: msg,
      vehicles: existingList,
      errors: [msg],
    };
  }

  const folderGroups = groupPlateFolders(folders);
  console.log(
    `[DriveOAuthSync] Índice Drive: ${folders.length} carpetas, ${folderGroups.size} patentes`,
  );

  const prioritized = prioritizeVehiclesForDriveSync(
    existingList.filter((v) => normalizePlateKey(v.plate || "")),
  );

  // cover_locked: la portada fijada no se toca. Las fotos nuevas de Drive
  // sí se agregan a la galería y no se quitan las que ya están.
  const coverLockedVehicles = prioritized.filter((v) => v.coverLocked === true);
  if (coverLockedVehicles.length > 0) {
    console.log(
      `[DriveOAuthSync] ${coverLockedVehicles.length} vehículos con portada bloqueada: se agregan fotos y se conserva la portada.`,
    );
  }

  const needingPhotos = prioritized.filter((v) => {
    const key = normalizePlateKey(v.plate || "");
    return key && folderGroups.has(key) && !v.hasRealPhotos;
  });
  const needingRefresh = prioritized.filter((v) => {
    const key = normalizePlateKey(v.plate || "");
    return key && folderGroups.has(key) && v.hasRealPhotos;
  });
  // Autos en cero primero, rotados para no repetir siempre el mismo slug.
  // Los que ya tienen alguna foto se rellenan solo si sobra presupuesto.
  const queue = [
    ...rotateSyncQueue(needingPhotos, state.zeroPhotoCursor),
    ...needingRefresh,
  ];

  const blobBudget: BlobHeadBudget = {
    used: 0,
    max: maxBlobHeadChecks,
    deadlineAt,
    reserveForUpload: false,
  };
  const knownBlobs = new Map<string, boolean>();
  const missingBySlug = new Map<string, Set<string>>();
  const probeOrder = rotateSyncQueue(needingRefresh, state.blobCheckCursor);
  // El sello de carpeta y los IDs ya presentes no ven un blob borrado.
  // Se revisa la galería con HEAD, rotando la patente para no repetir siempre
  // el mismo auto cuando el cupo se acaba.
  if (Date.now() < deadlineAt && blobBudget.max > 0 && needingRefresh.length > 0) {
    let cursorSet = false;
    let lastComplete: string | null = null;
    for (const vehicle of probeOrder) {
      const plateKey = normalizePlateKey(vehicle.plate || "");
      if (!blobHeadAllowed(blobBudget)) {
        state.blobCheckCursor = plateKey;
        state.blobCheckOffset = 0;
        cursorSet = true;
        break;
      }
      const urls = storedPhotoUrls(vehicle);
      if (urls.length === 0) {
        lastComplete = plateKey;
        continue;
      }
      const resumeHere = state.blobCheckCursor === plateKey;
      const start = resumeHere ? Math.min(state.blobCheckOffset || 0, urls.length) : 0;
      const probed = await galleryBlobsMissing(urls.slice(start), blobBudget, knownBlobs);
      if (probed.missing.size > 0) missingBySlug.set(vehicle.slug, probed.missing);
      if (!probed.complete) {
        state.blobCheckCursor = plateKey;
        state.blobCheckOffset = start + probed.checked;
        cursorSet = true;
        break;
      }
      state.blobCheckOffset = 0;
      lastComplete = plateKey;
    }
    if (!cursorSet && lastComplete) {
      const keys = probeOrder.map((vehicle) => normalizePlateKey(vehicle.plate || ""));
      const index = keys.indexOf(lastComplete);
      if (index >= 0) {
        state.blobCheckCursor = keys[(index + 1) % keys.length];
        state.blobCheckOffset = 0;
      }
    }
  }

  const orderedQueue = [
    ...queue.filter((vehicle) => missingBySlug.has(vehicle.slug)),
    ...queue.filter((vehicle) => !missingBySlug.has(vehicle.slug)),
  ];

  const toProcess: FolderCandidate[] = [];
  const emptyFolderHash = folderContentHash([]);
  let skippedUnchanged = 0;
  let deferredVehicles = 0;
  let folderLists = 0;

  for (let i = 0; i < orderedQueue.length; i++) {
    const vehicle = orderedQueue[i];
    const outOfBudget =
      Date.now() >= deadlineAt ||
      folderLists >= MAX_FOLDER_LISTS_PER_RUN ||
      toProcess.length >= maxVehicles;
    if (outOfBudget) {
      deferredVehicles += orderedQueue.length - i;
      break;
    }

    const key = normalizePlateKey(vehicle.plate || "");
    const plateFolders = (folderGroups.get(key) || []).filter((folder) =>
      folderMatchesVehiclePlate(folder.name, vehicle.plate),
    );
    if (plateFolders.length === 0) continue;

    const folderWork: FolderWork[] = [];
    let skippedThisVehicle = 0;
    let listingIncomplete = false;
    const missingUrls = missingBySlug.get(vehicle.slug);
    const coverDriveId = resolveStoredDriveId(vehicle.image, state);

    for (const folder of plateFolders) {
      const stamp = state.folders[folder.id];
      const emptyStamp =
        stamp?.contentHash === emptyFolderHash &&
        stamp?.revision === DRIVE_FOLDER_STAMP_REVISION;
      if (
        folderStampIsCurrent(folder, stamp) &&
        (vehicle.hasRealPhotos || emptyStamp) &&
        (!missingUrls || missingUrls.size === 0)
      ) {
        skippedThisVehicle += 1;
        continue;
      }
      if (folderLists >= MAX_FOLDER_LISTS_PER_RUN) {
        listingIncomplete = true;
        deferredVehicles += 1;
        break;
      }

      let images: DriveImageRef[] = [];
      try {
        folderLists += 1;
        images = await listImagesInFolder(folder.id);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        errors.push(`No se listaron fotos de ${folder.name}: ${detail}`);
        console.warn(`[DriveOAuthSync] No se listaron fotos de ${folder.name}:`, detail);
        continue;
      }
      if (images.length === 0) {
        stampDriveFolder(state, folder.id, folder.modifiedTime, folderContentHash([]));
        console.warn(`[DriveOAuthSync] Carpeta ${folder.name} sin imágenes`);
        skippedThisVehicle += 1;
        continue;
      }

      const contentHash = folderContentHash(images);
      adoptExistingPhotosIntoFileCache(vehicle, images, state, key);
      const presentIds = new Set(images.map((img) => img.id));
      const brokenUrlsByDriveId = new Map<string, string[]>();
      for (const url of missingUrls || []) {
        const id = resolveStoredDriveId(url, state);
        if (!id || !presentIds.has(id)) continue;
        appendBrokenUrl(brokenUrlsByDriveId, id, url);
      }
      for (const id of brokenUrlsByDriveId.keys()) {
        console.warn(
          `[DriveOAuthSync] Blob 404 en ${vehicle.slug} (${id}); el archivo sigue en Drive y se vuelve a subir.`,
        );
        delete state.files[id];
      }
      const hashUnchanged =
        vehicle.hasRealPhotos === true &&
        brokenUrlsByDriveId.size === 0 &&
        stamp?.revision === DRIVE_FOLDER_STAMP_REVISION &&
        stamp?.contentHash === contentHash &&
        images.every((img) => !driveFileNeedsSync(img, state.files[img.id]));
      if (hashUnchanged) {
        stampDriveFolder(
          state,
          folder.id,
          folder.modifiedTime || stamp?.modifiedTime,
          contentHash,
        );
        skippedThisVehicle += 1;
        continue;
      }

      for (const img of images) {
        const cachedUrl = state.files[img.id]?.blobUrl;
        if (!cachedUrl || brokenUrlsByDriveId.has(img.id)) continue;
        const known = knownBlobs.get(cachedUrl);
        if (known === false) {
          console.warn(
            `[DriveOAuthSync] Blob perdido para ${vehicle.slug} (${img.id}); se vuelve a subir.`,
          );
          appendBrokenUrl(brokenUrlsByDriveId, img.id, cachedUrl);
          delete state.files[img.id];
          continue;
        }
        if (known === true) continue;
        // Auto sin fotos (nuevo o re-creado tras salir de la planilla): el
        // caché puede apuntar a blobs borrados al archivarlo. Se verifica
        // siempre, aunque no quede cupo de HEAD.
        if (vehicle.hasRealPhotos && !blobHeadAllowed(blobBudget)) continue;
        blobBudget.used += 1;
        const exists = await blobStillExists(cachedUrl);
        knownBlobs.set(cachedUrl, exists);
        if (!exists) {
          blobBudget.reserveForUpload = true;
          console.warn(
            `[DriveOAuthSync] Blob perdido para ${vehicle.slug} (${img.id}); se vuelve a subir.`,
          );
          appendBrokenUrl(brokenUrlsByDriveId, img.id, cachedUrl);
          delete state.files[img.id];
        }
      }
      const needsWork =
        !vehicle.hasRealPhotos ||
        brokenUrlsByDriveId.size > 0 ||
        images.some((img) => driveFileNeedsSync(img, state.files[img.id]));
      if (!needsWork) {
        stampDriveFolder(state, folder.id, folder.modifiedTime, contentHash);
        skippedThisVehicle += 1;
        continue;
      }

      folderWork.push({
        folderId: folder.id,
        folderName: folder.name,
        folderModifiedTime: folder.modifiedTime,
        contentHash,
        images,
        brokenUrlsByDriveId,
      });
    }

    if (missingUrls && missingUrls.size > 0 && !listingIncomplete) {
      const matched = new Set<string>();
      for (const folder of folderWork) {
        for (const urls of folder.brokenUrlsByDriveId.values()) {
          for (const url of urls) matched.add(url);
        }
      }
      const unmatched = [...missingUrls].filter((url) => !matched.has(url));
      if (unmatched.length > 0) {
        console.warn(
          `[DriveOAuthSync] ${vehicle.plate || vehicle.slug}: ${unmatched.length} blob(s) 404 sin archivo en Drive; se conservan las filas.`,
        );
      }
    }

    if (skippedThisVehicle > 0 && folderWork.length === 0) {
      skippedUnchanged += 1;
      continue;
    }
    if (folderWork.length === 0) continue;

    const seenIds = new Set<string>();
    const images: DriveImageRef[] = [];
    for (const folder of folderWork) {
      for (const image of folder.images) {
        if (seenIds.has(image.id)) continue;
        seenIds.add(image.id);
        images.push(image);
      }
    }
    const brokenUrlsByDriveId = new Map<string, string[]>();
    for (const folder of folderWork) {
      for (const [id, urls] of folder.brokenUrlsByDriveId) {
        for (const url of urls) appendBrokenUrl(brokenUrlsByDriveId, id, url);
      }
    }
    console.log(
      `[DriveOAuthSync] Match ${vehicle.plate || key} → ${folderWork.map((folder) => folder.folderName).join(" + ")} (${images.length} fotos)`,
    );
    toProcess.push({
      vehicle,
      folders: folderWork,
      images,
      brokenUrlsByDriveId,
      brokenCoverDriveId:
        coverDriveId && brokenUrlsByDriveId.has(coverDriveId) ? coverDriveId : undefined,
    });
  }

  const matchedInStock = prioritized.filter((v) =>
    folderGroups.has(normalizePlateKey(v.plate || "")),
  ).length;

  if (folders.length === 0) {
    const msg =
      "Drive OAuth OK pero 0 subcarpetas. Revisá DRIVE_PHOTOS_FOLDER_ID " +
      "y que la cuenta del refresh token vea FOTOS RG/UNIDADES.";
    console.error(`[DriveOAuthSync] ${msg}`);
    return {
      success: false,
      totalFolders: 0,
      syncedVehicles: 0,
      newPhotosDownloaded: 0,
      message: msg,
      vehicles: existingList,
      errors: [msg],
    };
  }

  let newPhotos = 0;
  let repairedPhotos = 0;
  const replacedBlobUrls = new Set<string>();
  let synced = 0;
  let coverLockedUpdated = 0;
  let budgetExhausted = Date.now() >= deadlineAt;
  const zeroPhotoKeys = needingPhotos.map((vehicle) =>
    normalizePlateKey(vehicle.plate || ""),
  );
  let lastZeroAttempt: string | null = null;

  for (const item of toProcess) {
    const plateKey = normalizePlateKey(
      item.vehicle.plate || item.folders[0]?.folderName || "",
    );
    if (budgetExhausted || Date.now() >= deadlineAt) {
      deferredVehicles += 1;
      continue;
    }

    const galleryUrls: string[] = [];
    const replacements = new Map<string, string>();
    let uploadedThisVehicle = 0;
    let hitSlice = false;
    let attemptedDownload = false;
    const uploadOrder = [...item.images];
    if (item.brokenCoverDriveId) {
      uploadOrder.sort((a, b) => {
        if (a.id === item.brokenCoverDriveId) return -1;
        if (b.id === item.brokenCoverDriveId) return 1;
        return 0;
      });
    }

    for (const image of uploadOrder) {
      const cached = state.files[image.id];
      if (!driveFileNeedsSync(image, cached) && cached?.blobUrl) {
        galleryUrls.push(cached.blobUrl);
        continue;
      }
      if (uploadedThisVehicle >= photosPerVehicle) {
        hitSlice = true;
        break;
      }
      if (newPhotos >= maxNewPhotos || Date.now() >= deadlineAt) {
        hitSlice = true;
        budgetExhausted = true;
        break;
      }

      attemptedDownload = true;
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
          plate: plateKey,
        };
        galleryUrls.push(stored.url);
        uploadedThisVehicle += 1;
        newPhotos += 1;
        const brokenUrls = item.brokenUrlsByDriveId.get(image.id);
        if (brokenUrls?.length) {
          repairedPhotos += 1;
          for (const oldUrl of brokenUrls) {
            replacements.set(oldUrl, stored.url);
            replacedBlobUrls.add(oldUrl);
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        errors.push(`Falló foto ${image.name}: ${detail}`);
        console.warn(
          `[DriveOAuthSync] Falló foto ${image.name} (${image.id}):`,
          detail,
        );
        if (cached?.blobUrl) galleryUrls.push(cached.blobUrl);
      }
    }

    const mergedGallery = mergeGalleryKeepingExisting(
      [...(item.vehicle.gallery || []), item.vehicle.image].map(
        (url) => (url && replacements.get(url)) || url,
      ),
      galleryUrls,
    );
    const everyDriveFileRepresented = item.images.every(
      (image) =>
        fileIdFromStoredUrl(
          state.files[image.id]?.blobUrl || "",
        ) === image.id ||
        mergedGallery.some((url) => fileIdFromStoredUrl(url) === image.id),
    );
    const complete = everyDriveFileRepresented && !hitSlice;
    if (
      zeroPhotoKeys.includes(plateKey) &&
      (uploadedThisVehicle > 0 || (galleryUrls.length === 0 && attemptedDownload))
    ) {
      lastZeroAttempt = plateKey;
    }
    if (mergedGallery.length === 0) {
      deferredVehicles += 1;
      state.lastRunAt = new Date().toISOString();
      await saveDrivePhotosSyncState(state, tenantSlug);
      continue;
    }

    const locked = item.vehicle.coverLocked === true;
    const coverSource =
      (item.vehicle.image && replacements.get(item.vehicle.image)) || item.vehicle.image;
    const cover = locked
      ? coverSource
      : resolveCoverFromGallery(coverSource, mergedGallery);
    const orderedGallery = locked
      ? mergedGallery
      : orderGalleryWithCover(cover, mergedGallery);
    const vehicle: Vehicle = {
      ...item.vehicle,
      hasRealPhotos: true,
      gallery: orderedGallery,
      image: locked ? coverSource : cover || orderedGallery[0],
    };
    await saveVehicle(vehicle, { tenantSlug });
    synced += 1;
    if (locked) coverLockedUpdated += 1;
    let pendingFolder = false;
    for (const folder of item.folders) {
      const folderDone = folder.images.every((image) =>
        driveImageRepresented(image, state, orderedGallery),
      );
      if (folderDone) {
        stampDriveFolder(
          state,
          folder.folderId,
          folder.folderModifiedTime,
          folder.contentHash,
        );
      } else {
        pendingFolder = true;
      }
    }
    if (pendingFolder || !complete) deferredVehicles += 1;
    // Checkpoint por vehículo: si el cron corta a los 60s, no se pierde el progreso.
    state.lastRunAt = new Date().toISOString();
    await saveDrivePhotosSyncState(state, tenantSlug);
    console.log(
      `[DriveOAuthSync] ${item.folders.map((folder) => folder.folderName).join(" + ")} → ${item.vehicle.slug}: ${orderedGallery.length}/${item.images.length} fotos (${uploadedThisVehicle} nuevas)`,
    );
  }

  const stuck = probeOrder.find((vehicle) => {
    const missing = missingBySlug.get(vehicle.slug);
    if (!missing || missing.size === 0) return false;
    const item = toProcess.find((candidate) => candidate.vehicle.slug === vehicle.slug);
    if (!item) return true;
    const repairable: string[] = [];
    for (const urls of item.brokenUrlsByDriveId.values()) repairable.push(...urls);
    if (repairable.length === 0) return false;
    return repairable.some((url) => !replacedBlobUrls.has(url));
  });
  if (stuck) {
    state.blobCheckCursor = normalizePlateKey(stuck.plate || "");
    state.blobCheckOffset = 0;
  }

  if (lastZeroAttempt && zeroPhotoKeys.length > 1) {
    const rotated = rotateSyncQueue(needingPhotos, state.zeroPhotoCursor).map((vehicle) =>
      normalizePlateKey(vehicle.plate || ""),
    );
    const index = rotated.indexOf(lastZeroAttempt);
    if (index >= 0) {
      state.zeroPhotoCursor = rotated[(index + 1) % rotated.length];
    }
  }

  state.lastRunAt = new Date().toISOString();
  await saveDrivePhotosSyncState(state, tenantSlug);

  const pendingNote =
    deferredVehicles > 0
      ? ` Quedan ${deferredVehicles} para la próxima corrida (tope ${maxNewPhotos} fotos, ${photosPerVehicle} por auto; la cola rota).`
      : "";

  const updatedList = await getVehicles({
    tenantSlug,
    bypassCache: true,
    scope: "staff",
  });
  return {
    success: true,
    totalFolders: folders.length,
    syncedVehicles: synced,
    newPhotosDownloaded: newPhotos,
    repairedPhotos,
    skippedUnchanged,
    skippedCoverLocked: 0,
    deferredVehicles,
    errors,
    message:
      `Drive OAuth→Blob [${tenantSlug}]: ${synced} vehículos actualizados, ${newPhotos} fotos nuevas` +
      (repairedPhotos > 0 ? ` (${repairedPhotos} blobs 404 re-subidos)` : "") +
      `, ${skippedUnchanged} carpetas sin cambios, ${coverLockedUpdated} con portada fija conservada` +
      ` (${folders.length} carpetas Drive, ${matchedInStock} con match de patente en stock).` +
      pendingNote,
    vehicles: updatedList,
  };
}
