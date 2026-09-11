import type { Vehicle } from "@/lib/vehicles";

/** Estados visibles en catálogo / home (no borrador ni vendido). */
export function isPublicCatalogVehicle(v: Vehicle): boolean {
  const status = v.status || "Disponible";
  if (status === "Borrador" || status === "Vendido" || status === "En preparación") {
    return false;
  }
  // Solo listos para vender: precio real. Km puede faltar en hoja.
  if (!(v.price >= 1_000_000)) return false;
  if (!v.brand?.trim() || !v.model?.trim()) return false;
  return true;
}

/** ¿Cuenta como camioneta en filtros rápidos? */
export function isCamionetaBody(bodyType: string): boolean {
  const t = bodyType.toLowerCase();
  return t === "camioneta" || t === "pickup";
}

export function filterPublicCatalog(vehicles: Vehicle[]): Vehicle[] {
  return vehicles.filter(isPublicCatalogVehicle);
}

/** Destacados: prioriza fotos reales, luego featured. */
export function pickFeaturedVehicles(vehicles: Vehicle[], limit = 6): Vehicle[] {
  const publicList = filterPublicCatalog(vehicles);
  const withPhotos = publicList.filter(
    (v) => v.hasRealPhotos || (v.gallery && v.gallery.length > 0),
  );
  const pool = withPhotos.length > 0 ? withPhotos : publicList;
  const featured = pool.filter((v) => v.featured);
  const ordered = featured.length > 0 ? [...featured, ...pool.filter((v) => !v.featured)] : pool;
  return ordered.slice(0, limit);
}
