import { readJson, writeJson } from "./db";
import { Vehicle, vehicles as initialVehicles } from "@/lib/vehicles";
import { withFrontCover } from "@/lib/vehicles/frontCoverMap";
import { enrichVehicleTechSpec } from "@/lib/vehicles/techSpecs";
import { cacheGet, cacheInvalidate, cacheSet } from "./memoryCache";
import { logStorageHealthOnce } from "./storageHealth";

const FILENAME = "vehicles.json";
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
}): Promise<Vehicle[]> {
  logStorageHealthOnce();
  if (!opts?.bypassCache) {
    const cached = cacheGet<Vehicle[]>(CACHE_KEY);
    if (cached) return cached;
  }

  const list = await readJson<Vehicle[]>(FILENAME, initialVehicles);
  const safeList = Array.isArray(list) ? list : initialVehicles;
  if (!Array.isArray(list)) {
    console.error("[vehiclesStore] vehicles.json no es un array — usando fallback.");
  }
  const cleaned = safeList.map(normalizeVehicle);
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
): Promise<{ success: boolean; count: number; error?: string }> {
  const normalized = vehicles.map(normalizeVehicle);
  const ok = await writeJson(FILENAME, normalized);
  cacheInvalidate("vehicles:");
  if (!ok) return { success: false, count: 0, error: "Error al guardar el inventario." };
  cacheSet(CACHE_KEY, normalized, CACHE_TTL_MS);
  return { success: true, count: normalized.length };
}

export async function saveVehicle(
  vehicle: Vehicle,
): Promise<{ success: boolean; vehicle?: Vehicle; error?: string }> {
  // Siempre leer fresco: subidas secuenciales no deben pisarse por caché stale
  const list = await getVehicles({ bypassCache: true });
  const normalized = normalizeVehicle(vehicle);
  const next = list.slice();
  const existingIdx = next.findIndex((v) => v.slug === normalized.slug);

  if (existingIdx >= 0) {
    // Merge explícito: no perder gallery/image si normalize no los toca
    next[existingIdx] = { ...next[existingIdx], ...normalized };
  } else {
    next.unshift(normalized);
  }

  const ok = await writeJson(FILENAME, next);
  cacheInvalidate("vehicles:");
  if (!ok) {
    return {
      success: false,
      error:
        "No se pudo guardar el inventario (KV). La foto puede haberse subido; reintenta o revisa BLOB/KV.",
    };
  }
  cacheSet(CACHE_KEY, next.map(normalizeVehicle), CACHE_TTL_MS);
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
  const ok = await writeJson(FILENAME, filtered);
  cacheInvalidate("vehicles:");
  if (!ok) return { success: false, error: "Error al eliminar del almacenamiento." };
  return { success: true };
}
