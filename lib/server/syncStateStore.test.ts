import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSyncDetail } from "./catalogSyncDetail";

const isSupabaseConfigured = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured,
  createServerSupabase: () => ({ from }),
}));

import {
  CATALOG_CRON_SYNC_KEY,
  recordCatalogSyncState,
} from "./syncStateStore";

const detail: CatalogSyncDetail = {
  tenant: "rg-motors",
  read: 3,
  inserted: 1,
  updated: 1,
  skipped: 0,
  photos: 2,
  deferred: 0,
  errors: [],
  durationMs: 40,
  success: true,
};

describe("recordCatalogSyncState", () => {
  const upsert = vi.fn(async () => ({ error: null }));

  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
    from.mockImplementation((table: string) => {
      if (table === "tenants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "tenant-uuid" }, error: null }),
            }),
          }),
        };
      }
      return { upsert };
    });
  });

  it("hace upsert en sync_state con la clave del cron", async () => {
    const result = await recordCatalogSyncState("rg-motors", detail);
    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, options] = upsert.mock.calls[0];
    expect(row.tenant_id).toBe("tenant-uuid");
    expect(row.key).toBe(CATALOG_CRON_SYNC_KEY);
    expect(row.detail).toMatchObject({
      read: 3,
      inserted: 1,
      updated: 1,
      photos: 2,
      success: true,
      tenant: "rg-motors",
    });
    expect(typeof row.synced_at).toBe("string");
    expect(options).toEqual({ onConflict: "tenant_id,key" });
  });

  it("no lanza si Supabase no está configurado", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    await expect(recordCatalogSyncState("rg-motors", detail)).resolves.toEqual({
      ok: false,
      error: "Supabase no configurado",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("devuelve el error de upsert sin lanzar", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "rls" } });
    await expect(recordCatalogSyncState("unidades-chile", {
      ...detail,
      success: false,
      errors: ["falló drive"],
    })).resolves.toEqual({ ok: false, error: "rls" });
  });
});
