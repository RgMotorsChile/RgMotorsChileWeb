import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import {
  normalizePlateKey,
  pickBestPlateFolder,
  plateFolderNameVariants,
  plateFolderSearchPrefixes,
} from "@/lib/server/drivePlateMatch";

export const DEFAULT_DRIVE_PHOTOS_FOLDER_ID =
  "1etQDf-_InkLx8m4_AUMnc8xg2O_137St";

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export type DriveFolderRef = {
  id: string;
  name: string;
};

export type DriveImageRef = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
};

export function getDrivePhotosFolderId(): string {
  return (
    process.env.DRIVE_PHOTOS_FOLDER_ID?.trim() || DEFAULT_DRIVE_PHOTOS_FOLDER_ID
  );
}

export function isGoogleDriveOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim(),
  );
}

function requireOAuthEnv() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Faltan GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET o GOOGLE_DRIVE_REFRESH_TOKEN. " +
        "Corré scripts/google-drive-oauth-setup.mjs con la cuenta U y cargá las vars en Vercel.",
    );
  }
  return { clientId, clientSecret, refreshToken };
}

export function createDriveOAuthClient() {
  const { clientId, clientSecret, refreshToken } = requireOAuthEnv();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function createDriveApi(
  auth = createDriveOAuthClient(),
): drive_v3.Drive {
  return google.drive({ version: "v3", auth });
}

function isImageFile(file: drive_v3.Schema$File): boolean {
  const mime = String(file.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(String(file.name || ""));
}

/** Lista subcarpetas (patentes) bajo la carpeta raíz de fotos. */
export async function listPlateFolders(
  folderId = getDrivePhotosFolderId(),
  drive = createDriveApi(),
): Promise<DriveFolderRef[]> {
  const out: DriveFolderRef[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      spaces: "drive",
    });
    for (const f of res.data.files || []) {
      if (f.id && f.name) out.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return out;
}

/**
 * Busca carpeta de patente bajo la raíz.
 * Prioridad: nombre junto (RZVL18) → variantes con espacio/guion → contains + match normalizado.
 */
export async function findPlateFolderByName(
  plateKey: string,
  folderId = getDrivePhotosFolderId(),
  drive = createDriveApi(),
): Promise<DriveFolderRef | null> {
  const key = normalizePlateKey(plateKey);
  if (!key) return null;

  const parentQ = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  // 1) Exact match: RZVL18 primero, luego RZVL 18 / guiones
  for (const name of plateFolderNameVariants(plateKey)) {
    const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    try {
      const res = await drive.files.list({
        q: `${parentQ} and name = '${escaped}'`,
        fields: "files(id, name)",
        pageSize: 10,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        spaces: "drive",
      });
      const files = (res.data.files || []).filter(
        (f): f is { id: string; name: string } => Boolean(f.id && f.name),
      );
      const best = pickBestPlateFolder(plateKey, files);
      if (best) return { id: best.id, name: best.name };
    } catch (err) {
      console.warn(
        `[Drive] name='${name}' falló:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 2) Fallback: name contains letras de la patente + filtro normalizado
  for (const prefix of plateFolderSearchPrefixes(plateKey)) {
    const escaped = prefix.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    try {
      const res = await drive.files.list({
        q: `${parentQ} and name contains '${escaped}'`,
        fields: "files(id, name)",
        pageSize: 50,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        spaces: "drive",
      });
      const files = (res.data.files || []).filter(
        (f): f is { id: string; name: string } => Boolean(f.id && f.name),
      );
      const best = pickBestPlateFolder(plateKey, files);
      if (best) return { id: best.id, name: best.name };
    } catch (err) {
      console.warn(
        `[Drive] contains='${prefix}' falló:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return null;
}

/** Lista imágenes dentro de una carpeta de patente. */
export async function listImagesInFolder(
  folderId: string,
  drive = createDriveApi(),
): Promise<DriveImageRef[]> {
  const out: DriveImageRef[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      spaces: "drive",
    });
    for (const f of res.data.files || []) {
      if (!f.id || !f.name) continue;
      if (f.mimeType === "application/vnd.google-apps.folder") continue;
      if (!isImageFile(f)) continue;
      out.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType || "image/jpeg",
        modifiedTime: f.modifiedTime || undefined,
      });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return out.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/** Descarga bytes de un archivo de Drive (alt=media). */
export async function downloadDriveFileBytes(
  fileId: string,
  drive = createDriveApi(),
): Promise<Buffer> {
  const res = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "arraybuffer" },
  );
  const data = res.data as ArrayBuffer | Buffer | string;
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data);
  return Buffer.from(data);
}

export { DRIVE_READONLY_SCOPE };
