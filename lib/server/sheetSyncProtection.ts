import { Vehicle } from "@/lib/vehicles";

/**
 * La planilla no es la única fuente del inventario. Estos helpers evitan que
 * el sync borre autos cargados en el panel (sin patente, borrador, vendido,
 * en preparación) o cree un duplicado cuando la fila calza con uno de ellos.
 */

/** Mayúsculas y solo A-Z0-9. Sin patente normalizada, el auto no sale por la planilla. */
export function normalizePlate(p: unknown): string {
  if (p == null) return "";
  return String(p).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Vendido, Borrador y En preparación. Sin estado se asume Disponible. */
export function isInactiveStatus(status?: string | null): boolean {
  const value = status?.trim() ? status.trim() : "Disponible";
  return value === "Vendido" || value === "Borrador" || value === "En preparación";
}

/** Solo un auto con patente y estado activo puede salir del catálogo por la planilla. */
export function canLeaveCatalogBySheet(v: {
  plate?: string | null;
  status?: string | null;
}): boolean {
  if (!normalizePlate(v.plate)) return false;
  return !isInactiveStatus(v.status);
}

/** NFD, sin acentos, minúsculas, solo a-z0-9. "Citroën" y "CITROEN" calzan. */
function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Busca el auto del panel (sin patente) que corresponde a una fila nueva.
 * Devuelve el match solo si hay exactamente uno: misma marca plegada, mismo
 * año, y el modelo plegado es igual o uno contiene al otro.
 */
export function findPanelVehicleForSheetRow(
  row: { brand: string; model: string; year: number },
  vehicles: Vehicle[],
  alreadyAdopted: Set<string>,
): Vehicle | undefined {
  const rowBrand = foldName(row.brand);
  const rowModel = foldName(row.model);
  if (!rowBrand || !rowModel) return undefined;

  const matches = vehicles.filter((v) => {
    if (normalizePlate(v.plate)) return false;
    if (alreadyAdopted.has(v.slug)) return false;
    if (v.status === "Vendido") return false;
    if (v.year !== row.year) return false;
    if (foldName(v.brand) !== rowBrand) return false;
    const vehicleModel = foldName(v.model);
    if (!vehicleModel) return false;
    return (
      vehicleModel === rowModel ||
      vehicleModel.includes(rowModel) ||
      rowModel.includes(vehicleModel)
    );
  });

  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * replaceAllVehicles borra lo que no va en la lista. Se conservan los autos
 * actuales que este sync no reescribió y que no se archivaron a propósito.
 */
export function vehiclesToKeep(
  current: Vehicle[],
  nextList: Vehicle[],
  removedSlugs: Set<string>,
): Vehicle[] {
  const nextSlugs = new Set(nextList.map((v) => v.slug));
  return current.filter((v) => !nextSlugs.has(v.slug) && !removedSlugs.has(v.slug));
}
