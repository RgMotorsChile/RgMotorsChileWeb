import { Vehicle, vehicles as initialVehicles } from "@/lib/vehicles";
import { withFrontCover } from "@/lib/vehicles/frontCoverMap";
import { enrichVehicleTechSpec } from "@/lib/vehicles/techSpecs";
import { cacheGet, cacheInvalidate, cacheSet } from "./memoryCache";
import { logStorageHealthOnce } from "./storageHealth";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const CACHE_KEY = "vehicles:list";
/** Caché corta: lecturas de vitrina. Escrituras siempre bypasan caché. */
const CACHE_TTL_MS = 60_000;

/** RG Motors no ofrece garantía en usados: filtrar textos heredados. */
function stripWarrantyClaims(vehicle: Vehicle): Vehicle {
  if (!vehicle.highlights?.length) return vehicle;
  const cleaned = vehicle.highlights.filter(
    (h) => !/garant[ií]a/i.test(h) || /no ofrece garantía/i.test(h),
  );
  if (cleaned.length === vehicle.highlights.length) return vehicle;
  return { ...vehicle, highlights: cleaned };
}

function normalizeVehicle(vehicle: Vehicle): Vehicle {
  let cleaned = stripWarrantyClaims(vehicle);
  if (cleaned.bodyType === "Pickup") {
    cleaned = { ...cleaned, bodyType: "Camioneta" };
  }
  cleaned = enrichVehicleTechSpec(cleaned);
  return withFrontCover(cleaned);
}

export async function getVehicles(opts?: {
  bypassCache?: boolean;
  tenantSlug?: string;
}): Promise<Vehicle[]> {
  logStorageHealthOnce();
  const tenantSlug = opts?.tenantSlug || "rg-motors";
  const cacheKey =
    tenantSlug === "rg-motors" ? CACHE_KEY : `vehicles:list:${tenantSlug}`;

  if (!opts?.bypassCache) {
    const cached = cacheGet<Vehicle[]>(cacheKey);
    if (cached) return cached;
  }

  // Fuente de verdad: Supabase. Sin fallback KV (evita stock stale).
  if (isSupabaseConfigured()) {
    try {
      const { getCatalogVehiclesFromSupabase } =
        await import("@/lib/server/catalogSupabase");
      const remote = await getCatalogVehiclesFromSupabase(tenantSlug);
      const cleaned = (remote ?? []).map(normalizeVehicle);
      cacheSet(cacheKey, cleaned, CACHE_TTL_MS);
      return cleaned;
    } catch (err) {
      console.error("[vehiclesStore] Supabase falló:", err);
      return [];
    }
  }

  // Solo local/dev sin Supabase: seed estático RG.
  if (tenantSlug !== "rg-motors") return [];
  const cleaned = initialVehicles.map(normalizeVehicle);
  cacheSet(CACHE_KEY, cleaned, CACHE_TTL_MS);
  return cleaned;
}

export async function getVehicleBySlug(
  slug: string,
  opts?: { bypassCache?: boolean },
): Promise<Vehicle | null> {
  const list = await getVehicles(opts);
  return list.find((v) => v.slug === slug) ?? null;
}

/** Reemplaza el inventario completo (import Excel / sync). */
export async function replaceAllVehicles(
  vehicles: Vehicle[],
  opts?: { tenantSlug?: string },
): Promise<{ success: boolean; count: number; error?: string }> {
  const tenantSlug = opts?.tenantSlug || "rg-motors";
  const normalized = vehicles.map(normalizeVehicle);

  try {
    const { upsertCatalogVehiclesToSupabase } =
      await import("@/lib/server/catalogSupabase");
    const remote = await upsertCatalogVehiclesToSupabase(normalized, tenantSlug);
    if (!remote.ok) {
      return {
        success: false,
        count: 0,
        error: remote.error || "No se pudo guardar en Supabase",
      };
    }
  } catch (err) {
    console.warn("[vehiclesStore] Supabase upsert falló:", err);
    return {
      success: false,
      count: 0,
      error: "Supabase no disponible",
    };
  }

  const cacheKey =
    tenantSlug === "rg-motors" ? CACHE_KEY : `vehicles:list:${tenantSlug}`;
  cacheInvalidate("vehicles:");
  cacheSet(cacheKey, normalized, CACHE_TTL_MS);

  return { success: true, count: normalized.length };
}

export async function saveVehicle(
  vehicle: Vehicle,
  opts?: { tenantSlug?: string },
): Promise<{ success: boolean; vehicle?: Vehicle; error?: string }> {
  const tenantSlug = opts?.tenantSlug || "rg-motors";
  const list = await getVehicles({ bypassCache: true, tenantSlug });
  const normalized = normalizeVehicle(vehicle);
  const next = list.slice();
  const existingIdx = next.findIndex((v) => v.slug === normalized.slug);

  if (existingIdx >= 0) {
    next[existingIdx] = { ...next[existingIdx], ...normalized };
  } else {
    next.unshift(normalized);
  }

  try {
    const { upsertCatalogVehiclesToSupabase } =
      await import("@/lib/server/catalogSupabase");
    const remote = await upsertCatalogVehiclesToSupabase([normalized], tenantSlug);
    if (!remote.ok) {
      return {
        success: false,
        error: remote.error || "No se pudo guardar en Supabase",
      };
    }
  } catch (err) {
    console.warn("[vehiclesStore] saveVehicle Supabase:", err);
    return { success: false, error: "Supabase no disponible" };
  }

  const cacheKey =
    tenantSlug === "rg-motors" ? CACHE_KEY : `vehicles:list:${tenantSlug}`;
  cacheInvalidate("vehicles:");
  cacheSet(cacheKey, next.map(normalizeVehicle), CACHE_TTL_MS);
  return { success: true, vehicle: normalized };
}

export async function deleteVehicle(
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  const list = await getVehicles({ bypassCache: true });
  const filtered = list.filter((v) => v.slug !== slug);
  if (filtered.length === list.length) {
    return { success: false, error: "Vehículo no encontrado." };
  }

  try {
    const { deleteCatalogVehicleFromSupabase } =
      await import("@/lib/server/catalogSupabase");
    const remote = await deleteCatalogVehicleFromSupabase(slug, "rg-motors");
    if (!remote.ok) {
      return { success: false, error: remote.error || "No se pudo borrar en Supabase" };
    }
  } catch (err) {
    console.warn("[vehiclesStore] deleteVehicle Supabase:", err);
    return { success: false, error: "Supabase no disponible" };
  }

  cacheInvalidate("vehicles:");
  cacheSet(CACHE_KEY, filtered, CACHE_TTL_MS);
  return { success: true };
}
