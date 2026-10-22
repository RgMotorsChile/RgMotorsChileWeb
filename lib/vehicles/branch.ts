/**
 * Sucursal física. La tabla docs/stock-sucursal.csv manda.
 * a_confirmar no se mueve. rg se queda. uc y salgado salen de este dominio.
 */
import { stockRowFor } from "./stockSucursal";

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

/** Hilux que ya no está en este dominio: vive en Unidades Chile. */
export const MOVED_TO_OTHER_SITE: { plate: string; url: string }[] = [
  {
    plate: "rhcl44",
    url: "https://www.unidadeschile.cl/catalogo/toyota-new-hilux-4x2-2022-rhcl44",
  },
];

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
  const site = stockRowFor(vehicle)?.sitio;
  if (site === "rg" || site === "a_confirmar") return true;
  if (site === "uc" || site === "salgado") return false;
  return branchOf(vehicle) === "rg-motors";
}

export function externalUrlForPlate(plate: string): string | null {
  const token = plate.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return MOVED_TO_OTHER_SITE.find((row) => row.plate === token)?.url || null;
}
