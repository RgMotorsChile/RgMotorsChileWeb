/**
 * Sucursal física. docs/stock-sucursal.csv junta la celda UBICACION y las pestañas.
 * Si incluye rg, la ficha se queda aquí con canónico propio y entra al sitemap.
 * 410 solo cuando ninguna fuente pone el auto en RG.
 */
import { listedOnRg } from "./stockSucursal";

export const BRANCHES = ["rg-motors", "unidades-chile", "salgado"] as const;
export type BranchId = (typeof BRANCHES)[number];

export type BranchAssignment = {
  branch: BranchId;
  /** Por qué no se publica en rgmotorschile.cl */
  reason: string;
  /** Ficha en el sitio correcto. Sin URL, la ruta de este dominio responde 410. */
  externalUrl?: string;
};

/** Reservado. La sucursal de un duplicado sale de docs/stock-sucursal.csv. */
export const BRANCH_ASSIGNMENTS: Record<string, BranchAssignment> = {};

/**
 * Ya no se usa para cruzar sitios. Una patente que está en la pestaña de RG
 * y en otra se publica en las dos, sin 301.
 */
export const MOVED_TO_OTHER_SITE: { plate: string; url: string }[] = [];

export function isBranchId(value: string | undefined | null): value is BranchId {
  return BRANCHES.includes(value as BranchId);
}

export function branchOf(vehicle: { slug: string; branch?: string }): BranchId {
  if (isBranchId(vehicle.branch) && !BRANCH_ASSIGNMENTS[vehicle.slug]) {
    return vehicle.branch;
  }
  return BRANCH_ASSIGNMENTS[vehicle.slug]?.branch || (isBranchId(vehicle.branch) ? vehicle.branch : "rg-motors");
}

export function publishesOnRg(vehicle: { slug: string; plate?: string; branch?: string }): boolean {
  const listed = listedOnRg(vehicle);
  if (listed === true) return true;
  if (listed === false) return false;
  return branchOf(vehicle) === "rg-motors";
}

export function externalUrlForPlate(plate: string): string | null {
  const token = plate.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return MOVED_TO_OTHER_SITE.find((row) => row.plate === token)?.url || null;
}
