/**
 * En Vercel Production, Supabase (service role) es obligatorio para no perder
 * documentos del sitio. Las fotos van a Supabase Storage.
 */
import { isSupabaseConfigured } from "@/lib/supabase/client";

export function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** @deprecated Vercel KV se retiró. Equivale a tener service role de Supabase. */
export function isKvReady(): boolean {
  return isSupabaseConfigured();
}

/** Token del Blob viejo. La subida de fotos ya no lo usa; queda para la limpieza manual. */
export function isBlobReady(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function assertProductionStorage(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!isVercelProduction()) {
    return { ok: true, warnings };
  }
  if (!isSupabaseConfigured()) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY ausente: documentos y fotos no se pueden guardar en producción.",
    );
  }
  return { ok: isSupabaseConfigured(), warnings };
}

export function logStorageHealthOnce(): void {
  const g = globalThis as typeof globalThis & { __rgStorageLogged?: boolean };
  if (g.__rgStorageLogged) return;
  g.__rgStorageLogged = true;
  const health = assertProductionStorage();
  for (const w of health.warnings) {
    console.warn(`[RG Storage] ${w}`);
  }
  if (health.ok && isVercelProduction()) {
    console.info("[RG Storage] Supabase OK — documentos y fotos en el proyecto RG.");
  }
}
