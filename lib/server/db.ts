import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { kv } from "@vercel/kv";
import { isKvReady, isVercelProduction, logStorageHealthOnce } from "@/lib/server/storageHealth";

// Usamos data local si es escribible, o tmpdir en entornos serverless/Vercel
const LOCAL_DIR = join(/*turbopackIgnore: true*/ process.cwd(), "data");
const TMP_DIR = os.tmpdir() + "/rgmotors_data";

function getPossiblePaths(filename: string) {
  return [join(LOCAL_DIR, filename), join(TMP_DIR, filename)];
}

const isKvConfigured = () => isKvReady();

/**
 * Lee un archivo JSON de forma segura.
 * En desarrollo prioriza data/ local para no pisar el stock nuevo con KV viejo.
 * Si el archivo no existe, devuelve `fallback` y lo almacena (salvo seed=false vía peek).
 */
export async function readJsonOptional<T>(filename: string): Promise<T | null> {
  logStorageHealthOnce();

  const preferLocal =
    process.env.NODE_ENV !== "production" || process.env.RG_PREFER_LOCAL_DATA === "1";

  if (preferLocal) {
    const localPath = join(LOCAL_DIR, filename);
    try {
      if (existsSync(localPath)) {
        const content = await readFile(localPath, "utf8");
        return JSON.parse(content) as T;
      }
    } catch (error) {
      console.warn(`Error leyendo local ${filename}:`, error);
    }
  }

  if (isKvConfigured()) {
    try {
      let data = await kv.get<T>(filename);
      // Defensa: algunos writes REST dejan el valor como string JSON.
      if (typeof data === "string") {
        try {
          data = JSON.parse(data) as T;
        } catch {
          /* keep string */
        }
      }
      if (data !== null && data !== undefined) return data;
    } catch (error) {
      console.warn(`Error leyendo ${filename} de Vercel KV:`, error);
    }
  }

  const paths = getPossiblePaths(filename);
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const content = await readFile(p, "utf8");
        return JSON.parse(content) as T;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Lee un archivo JSON de forma segura.
 * En desarrollo prioriza data/ local para no pisar el stock nuevo con KV viejo.
 * Si el archivo no existe: en prod NO siembra fallback (evita stock demo / defaults
 * inventados); en local sí escribe el fallback para DX.
 */
export async function readJson<T>(filename: string, fallback: T): Promise<T> {
  const existing = await readJsonOptional<T>(filename);
  if (existing !== null) return existing;

  if (isVercelProduction()) {
    console.warn(
      `[RG Storage] ${filename} ausente en KV — no se siembra fallback en producción.`,
    );
    return fallback;
  }

  await writeJson(filename, fallback);
  return fallback;
}

/**
 * Escribe un archivo JSON de forma segura.
 * En Vercel Production solo cuenta el éxito en KV (disco local es efímero).
 */
export async function writeJson<T>(filename: string, data: T): Promise<boolean> {
  logStorageHealthOnce();

  if (isVercelProduction() && !isKvConfigured()) {
    console.error(
      `[RG Storage] Rechazando escritura de ${filename}: KV obligatorio en Vercel Production.`,
    );
    return false;
  }

  let kvSuccess = false;
  if (isKvConfigured()) {
    try {
      await kv.set(filename, data);
      kvSuccess = true;
    } catch (error) {
      console.warn(`Error escribiendo ${filename} en Vercel KV:`, error);
    }
  }

  let localSuccess = false;
  const paths = getPossiblePaths(filename);
  for (const p of paths) {
    try {
      const dir = p.endsWith(filename) ? p.slice(0, -filename.length) : LOCAL_DIR;
      await mkdir(dir, { recursive: true });
      await writeFile(p, JSON.stringify(data, null, 2), "utf8");
      localSuccess = true;
      break;
    } catch {
      // Si falla, intenta en la siguiente ruta (ej. tmpdir)
    }
  }

  if (isVercelProduction()) {
    if (!kvSuccess) {
      console.error(
        `[RG Storage] Escritura de ${filename} falló en KV — no se considera persistida.`,
      );
    }
    return kvSuccess;
  }

  return kvSuccess || localSuccess;
}
