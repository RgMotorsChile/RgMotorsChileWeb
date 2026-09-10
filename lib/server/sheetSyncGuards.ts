/**
 * Guardas anti-wipe y reglas de inventario desde Sheets (solo RG MOTORS).
 */

/** Única pestaña de stock que alimenta el sitio. */
export const INVENTORY_SHEET_TAB = "RG MOTORS";

export function isInventorySheetTab(name: string): boolean {
  return name.trim().toUpperCase() === INVENTORY_SHEET_TAB;
}

const BLOCKED_INVENTORY_TEXT =
  /falta|reservado|preparacion|preparación|terminar|taller|casa|consignado|\brq\b|fotos|en revision|en revisión|sin precio|sin km|pendiente/i;

/** Texto de celda/fila que indica no listo para vitrina. */
export function hasBlockedInventoryText(...parts: unknown[]): boolean {
  const joined = parts.map((p) => (p == null ? "" : String(p))).join(" ");
  return BLOCKED_INVENTORY_TEXT.test(joined);
}

export type SellableSheetRowInput = {
  price: number;
  km: number;
  brand?: string;
  model?: string;
  year?: number;
  /** Texto crudo de la fila (precio, km, notas, etc.). */
  rawParts?: unknown[];
};

/**
 * Solo entran al catálogo activo: precio y km reales, marca/modelo/año, sin preparación.
 */
export function isSellableSheetRow(input: SellableSheetRowInput): boolean {
  if (input.price <= 0 || input.km <= 0) return false;
  if (!input.brand || !String(input.brand).trim()) return false;
  if (!input.model || !String(input.model).trim()) return false;
  const year = Number(input.year) || 0;
  if (year < 1990 || year > new Date().getFullYear() + 1) return false;
  if (input.rawParts && hasBlockedInventoryText(...input.rawParts)) return false;
  return true;
}

export type MassArchiveGuardInput = {
  /** Filas activas válidas leídas de la hoja (no vendidas). */
  sheetActiveCount: number;
  /** Unidades activas actuales en el store. */
  currentActiveCount: number;
  /** Cuántas se archivarían por no aparecer en la hoja. */
  wouldArchiveCount: number;
  /** Umbral de caída relativa (0–1). Default 35%. */
  maxDropRatio?: number;
  /** Mínimo de stock actual para aplicar ratio. */
  minStockForRatio?: number;
};

export type MassArchiveGuardResult =
  | { abortAll: true; skipArchive: true; reason: string }
  | { abortAll: false; skipArchive: true; reason: string }
  | { abortAll: false; skipArchive: false };

/**
 * - Hoja vacía → abortar sync completo (no escribir).
 * - Caída masiva sospechosa → aplicar altas/updates pero NO archivar faltantes.
 */
export function evaluateSheetWipeGuard(
  input: MassArchiveGuardInput,
): MassArchiveGuardResult {
  const maxDropRatio = input.maxDropRatio ?? 0.35;
  const minStockForRatio = input.minStockForRatio ?? 5;

  if (input.sheetActiveCount <= 0) {
    return {
      abortAll: true,
      skipArchive: true,
      reason:
        "Planilla sin filas activas válidas — sync abortado (anti-wipe). Revisa la hoja o el scrape.",
    };
  }

  if (
    input.currentActiveCount >= minStockForRatio &&
    input.wouldArchiveCount >= 3
  ) {
    const ratio = input.wouldArchiveCount / input.currentActiveCount;
    if (ratio > maxDropRatio) {
      return {
        abortAll: false,
        skipArchive: true,
        reason: `Caída sospechosa del stock (${Math.round(ratio * 100)}% / ${input.wouldArchiveCount} unidades). Se actualizan precios/km y altas, pero no se archiva masivo.`,
      };
    }
  }

  return { abortAll: false, skipArchive: false };
}

/** Inferencia conservadora de carrocería; sin inventar diésel/manual. */
export function guessBodyTypeFromModel(model: string): string {
  const m = model.toUpperCase();
  if (
    /HILUX|L200|NAVARA|AMAROK|COLORADO|DMAX|T60|RAPTOR|SAVEIRO|KATANA|PORTER|RANGER/.test(
      m,
    )
  ) {
    return "Camioneta";
  }
  if (/PARTNER|EXPERT|XZU|FURGON|FURGÓN/.test(m)) return "Furgón";
  if (/RAIZE|FORESTER|2008|SUZUKI|SUV|WRX/.test(m)) return "SUV";
  if (/ML300|SEDAN|SEDÁN/.test(m)) return "Sedán";
  return "Por confirmar";
}
