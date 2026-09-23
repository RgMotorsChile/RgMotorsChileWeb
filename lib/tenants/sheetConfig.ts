/**
 * Config de tenant para sync Sheets / Drive.
 * Misma planilla; pestaña distinta por automotora.
 */
export type TenantSheetConfig = {
  slug: string;
  sheetId: string;
  sheetTab: string;
};

export const TENANT_SHEETS: Record<string, TenantSheetConfig> = {
  "rg-motors": {
    slug: "rg-motors",
    sheetId:
      process.env.GOOGLE_SHEET_ID?.trim() ||
      "1BG2uR6APbXEMvVvRmdR-Nn0Vko6eobJ6Xam0XX41Ldc",
    sheetTab: "RG MOTORS",
  },
  "unidades-chile": {
    slug: "unidades-chile",
    sheetId:
      process.env.GOOGLE_SHEET_ID?.trim() ||
      "1BG2uR6APbXEMvVvRmdR-Nn0Vko6eobJ6Xam0XX41Ldc",
    sheetTab: "UNIDADES CHILE",
  },
};

export function getTenantSheetConfig(slug: string): TenantSheetConfig {
  const cfg = TENANT_SHEETS[slug];
  if (!cfg) throw new Error(`Tenant desconocido: ${slug}`);
  return cfg;
}

export function isSheetTabForTenant(tabName: string, tenantSlug: string): boolean {
  const cfg = TENANT_SHEETS[tenantSlug];
  if (!cfg) return false;
  return tabName.trim().toUpperCase() === cfg.sheetTab.toUpperCase();
}
