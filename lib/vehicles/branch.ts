/**
 * Sucursal física. La tabla docs/stock-sucursal.csv anota dónde aparece cada patente.
 * Un auto que sigue en el catálogo de este sitio se queda con su ficha.
 * El que sale de la planilla de RG lo retira el sync: deja de publicarse
 * y su URL no redirige a otro sitio.
 */


export const BRANCHES = ["rg-motors", "unidades-chile", "salgado"] as const;
export type BranchId = (typeof BRANCHES)[number];

export type BranchAssignment = {
  branch: BranchId;
  /** Por qué no se publica en rgmotorschile.cl */
  reason: string;
  /** Reservado. Este dominio no redirige la ficha a otro sitio. */
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

/** Mientras la fila siga en el catálogo de este sitio, la ficha se publica aquí. */
export function publishesOnRg(_vehicle: { slug: string; plate?: string; branch?: string }): boolean {
  return true;
}

export function externalUrlForPlate(plate: string): string | null {
  const token = plate.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return MOVED_TO_OTHER_SITE.find((row) => row.plate === token)?.url || null;
}
