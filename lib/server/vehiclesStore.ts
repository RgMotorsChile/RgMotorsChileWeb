import { Vehicle, vehicles as initialVehicles } from "@/lib/vehicles";
import { withFrontCover } from "@/lib/vehicles/frontCoverMap";
import { enrichVehicleTechSpec } from "@/lib/vehicles/techSpecs";
import { cacheGet, cacheInvalidate, cacheSet } from "./memoryCache";
import { logStorageHealthOnce } from "./storageHealth";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { CatalogReadScope } from "@/lib/server/catalogSupabase";
import { stripPlateForPublic } from "@/lib/vehicles/publicFields";

const CACHE_KEY = "vehicles:list";
/** Caché corta: lecturas de vitrina. Escrituras siempre bypasan caché. */
const CACHE_TTL_MS = 60_000;

/**
 * Textos heredados que ya no se publican: RG Motors no ofrece garantía en usados
 * y ya no menciona a la financiera (Autofin) en el sitio. Se filtran en lectura.
 */
function stripLegacyHighlights(vehicle: Vehicle): Vehicle {
  if (!vehicle.highlights?.length) return vehicle;
  const cleaned = vehicle.highlights.filter(
    (h) =>
      (!/garant[ií]a/i.test(h) || /no ofrece garantía/i.test(h)) && !/autofin/i.test(h),
  );
  if (cleaned.length === vehicle.highlights.length) return vehicle;
  return { ...vehicle, highlights: cleaned };
}

/** Dirección legada en datos de stock: el showroom está en Av. Cardonal. */
const LEGACY_ADDRESS_RE = /Av\.\s*El\s+Tepual/i;

function normalizeVehicle(vehicle: Vehicle): Vehicle {
  let cleaned = stripLegacyHighlights(vehicle);
  if (cleaned.location && LEGACY_ADDRESS_RE.test(cleaned.location)) {
    cleaned = {
      ...cleaned,
      location: cleaned.location.replace(LEGACY_ADDRESS_RE, "Av. Cardonal"),
    };
  }
  if (cleaned.bodyType === "Pickup") {
    cleaned = { ...cleaned, bodyType: "Camioneta" };
  }
  cleaned = enrichVehicleTechSpec(cleaned);
  return withFrontCover(cleaned);
}

function listCacheKey(tenantSlug: string, scope: CatalogReadScope): string {
  const base =
    tenantSlug === "rg-motors" ? CACHE_KEY : `vehicles:list:${tenantSlug}`;
  return scope === "staff" ? `${base}:staff` : base;
}

export async function getVehicles(opts?: {
  bypassCache?: boolean;
  tenantSlug?: string;
  /** `public` omite columnas internas. Jobs y admin usan `staff`. */
  scope?: CatalogReadScope;
}): Promise<Vehicle[]> {
  logStorageHealthOnce();
  const tenantSlug = opts?.tenantSlug || "rg-motors";
  const scope = opts?.scope ?? "public";
  const cacheKey = listCacheKey(tenantSlug, scope);

  if (!opts?.bypassCache) {
    const cached = cacheGet<Vehicle[]>(cacheKey);
    if (cached) return cached;
  }

  // Fuente de verdad: Supabase. Sin fallback KV (evita stock stale).
  if (isSupabaseConfigured()) {
    try {
      const { getCatalogVehiclesFromSupabase } =
        await import("@/lib/server/catalogSupabase");
      const remote = await getCatalogVehiclesFromSupabase(tenantSlug, scope);
      const cleaned = (remote ?? []).map(normalizeVehicle);
      cacheSet(cacheKey, cleaned, CACHE_TTL_MS);
      return cleaned;
    } catch (err) {
      console.error("[vehiclesStore] Supabase falló:", err);
      return [];
    }
  }

  // Solo local/dev sin Supabase: seed estático RG.
  // El scope público sale sin patente ni columnas de patio, igual que el select explícito.
  if (tenantSlug !== "rg-motors") return [];
  const cleaned = initialVehicles.map(normalizeVehicle);
  const scoped =
    scope === "public"
      ? cleaned.map((vehicle) => stripPlateForPublic(vehicle))
      : cleaned;
  cacheSet(cacheKey, scoped, CACHE_TTL_MS);
  return scoped;
}

export async function getVehicleBySlug(
  slug: string,
  opts?: { bypassCache?: boolean; scope?: CatalogReadScope },
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
    const { replaceCatalogVehiclesInSupabase } =
      await import("@/lib/server/catalogSupabase");
    const remote = await replaceCatalogVehiclesInSupabase(normalized, tenantSlug);
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

  cacheInvalidate("vehicles:");
  cacheSet(listCacheKey(tenantSlug, "staff"), normalized, CACHE_TTL_MS);

  return { success: true, count: normalized.length };
}

export async function saveVehicle(
  vehicle: Vehicle,
  opts?: { tenantSlug?: string },
): Promise<{ success: boolean; vehicle?: Vehicle; error?: string }> {
  const tenantSlug = opts?.tenantSlug || "rg-motors";
  const list = await getVehicles({
    bypassCache: true,
    scope: "staff",
    tenantSlug,
  });
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

  cacheInvalidate("vehicles:");
  cacheSet(
    listCacheKey(tenantSlug, "staff"),
    next.map(normalizeVehicle),
    CACHE_TTL_MS,
  );
  return { success: true, vehicle: normalized };
}

export async function deleteVehicle(
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  const list = await getVehicles({ bypassCache: true, scope: "staff" });
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
  cacheSet(listCacheKey("rg-motors", "staff"), filtered, CACHE_TTL_MS);
  return { success: true };
}
