import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { CatalogSyncDetail } from "@/lib/server/catalogSyncDetail";

/** Clave de `sync_state` para el cron de catálogo (no pisa el sync de bodega). */
export const CATALOG_CRON_SYNC_KEY = "catalog_cron";

/**
 * Upsert de la última corrida. No lanza: el cron tiene que poder responder
 * aunque Supabase falle, y el caller igual intenta escribir en el fallo del sync.
 */
export async function recordCatalogSyncState(
  tenantSlug: string,
  detail: CatalogSyncDetail,
): Promise<{ ok: boolean; error?: string }> {
  const rowDetail: CatalogSyncDetail = { ...detail, tenant: tenantSlug };
  if (!isSupabaseConfigured()) {
    console.warn("[SyncState] Supabase no configurado; no se escribió sync_state.");
    return { ok: false, error: "Supabase no configurado" };
  }

  try {
    const sb = createServerSupabase();
    const { data: tenant, error: tenantError } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tenantError || !tenant?.id) {
      const error = tenantError?.message || "Tenant no encontrado";
      console.error("[SyncState]", tenantSlug, error);
      return { ok: false, error };
    }

    const { error } = await sb.from("sync_state").upsert(
      {
        tenant_id: tenant.id,
        key: CATALOG_CRON_SYNC_KEY,
        synced_at: new Date().toISOString(),
        detail: rowDetail,
      },
      { onConflict: "tenant_id,key" },
    );
    if (error) {
      console.error("[SyncState] upsert falló:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[SyncState]", error);
    return { ok: false, error };
  }
}
