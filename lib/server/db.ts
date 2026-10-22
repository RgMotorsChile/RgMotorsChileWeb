import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { isVercelProduction, logStorageHealthOnce } from "@/lib/server/storageHealth";

// Usamos data local si es escribible, o tmpdir en entornos serverless/Vercel
const LOCAL_DIR = join(/*turbopackIgnore: true*/ process.cwd(), "data");
const TMP_DIR = os.tmpdir() + "/rgmotors_data";

function getPossiblePaths(filename: string) {
  return [join(LOCAL_DIR, filename), join(TMP_DIR, filename)];
}

/**
 * Lee un documento JSON.
 * En desarrollo prioriza data/ local.
 * En producción la fuente es public.app_documents (service role).
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

  if (isSupabaseConfigured()) {
    try {
      const sb = createServerSupabase();
      const { data, error } = await sb
        .from("app_documents")
        .select("value")
        .eq("key", filename)
        .maybeSingle();
      if (error) {
        console.warn(`Error leyendo ${filename} de Supabase:`, error.message);
      } else if (data && data.value !== null && data.value !== undefined) {
        return data.value as T;
      }
    } catch (error) {
      console.warn(`Error leyendo ${filename} de Supabase:`, error);
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
 * Si el documento no existe: en prod NO siembra fallback; en local sí, para DX.
 */
export async function readJson<T>(filename: string, fallback: T): Promise<T> {
  const existing = await readJsonOptional<T>(filename);
  if (existing !== null) return existing;

  if (isVercelProduction()) {
    console.warn(
      `[RG Storage] ${filename} ausente en Supabase — no se siembra fallback en producción.`,
    );
    return fallback;
  }

  await writeJson(filename, fallback);
  return fallback;
}

/**
 * Escribe un documento JSON.
 * En Vercel Production solo cuenta el éxito en Supabase (disco local es efímero).
 */
export async function writeJson<T>(filename: string, data: T): Promise<boolean> {
  logStorageHealthOnce();

  if (isVercelProduction() && !isSupabaseConfigured()) {
    console.error(
      `[RG Storage] Rechazando escritura de ${filename}: SUPABASE_SERVICE_ROLE_KEY es obligatorio en producción.`,
    );
    return false;
  }

  let remoteSuccess = false;
  if (isSupabaseConfigured()) {
    try {
      const sb = createServerSupabase();
      const { error } = await sb.from("app_documents").upsert(
        { key: filename, value: data, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (error) {
        console.warn(`Error escribiendo ${filename} en Supabase:`, error.message);
      } else {
        remoteSuccess = true;
      }
    } catch (error) {
      console.warn(`Error escribiendo ${filename} en Supabase:`, error);
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
    if (!remoteSuccess) {
      console.error(
        `[RG Storage] Escritura de ${filename} falló en Supabase — no se considera persistida.`,
      );
    }
    return remoteSuccess;
  }

  return remoteSuccess || localSuccess;
}
