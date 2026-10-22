/**
 * Sucursal física. Cada dominio publica solo los autos que están en su patio.
 * "Cardonal" a secas no alcanza: RG y Salgado están en la misma avenida.
 * La asignación de abajo sale de la ubicación que Salgado publica para la misma patente.
 */

export const BRANCHES = ["rg-motors", "unidades-chile", "salgado"] as const;
export type BranchId = (typeof BRANCHES)[number];

export type BranchAssignment = {
  branch: BranchId;
  /** Por qué no se publica en rgmotorschile.cl */
  reason: string;
  /** Ficha en el sitio correcto. Sin URL, la ruta de este dominio responde 410. */
  externalUrl?: string;
};

export const BRANCH_ASSIGNMENTS: Record<string, BranchAssignment> = {
  "ford-ranger-4x4-2023-shyl53": {
    branch: "unidades-chile",
    reason: "Salgado Automotriz marca la ubicación física como Uni Chile y no hay ficha en unidadeschile.cl.",
  },
  "chevrolet-tracker-mt-2022-rzkv76": {
    branch: "unidades-chile",
    reason: "Salgado Automotriz marca la ubicación física como Unidades De Chile y no hay ficha en unidadeschile.cl.",
  },
};

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

export function publishesOnRg(vehicle: { slug: string; branch?: string }): boolean {
  return branchOf(vehicle) === "rg-motors";
}

export function externalUrlForPlate(plate: string): string | null {
  const token = plate.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return MOVED_TO_OTHER_SITE.find((row) => row.plate === token)?.url || null;
}
