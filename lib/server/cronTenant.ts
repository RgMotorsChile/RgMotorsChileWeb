/** Tenants que el cron de catálogo sabe sincronizar. */
export const CRON_TENANTS = ["rg-motors", "unidades-chile"] as const;

export type CronTenant = (typeof CRON_TENANTS)[number];

export type CronTenantResolution =
  | { ok: true; tenant: CronTenant; source: "query" | "hour" }
  | { ok: false; error: string };

/**
 * `?tenant=` explícito gana. Sin parámetro se mantiene el fallback por hora
 * de los horarios diarios (12:00 UTC = Unidades Chile). GitHub Actions manda ?tenant=.
 */
export function resolveCronTenant(
  tenantParam: string | null | undefined,
  now: Date = new Date(),
): CronTenantResolution {
  const raw = tenantParam?.trim() ?? "";
  if (!raw) {
    const tenant: CronTenant =
      now.getUTCHours() === 12 ? "unidades-chile" : "rg-motors";
    return { ok: true, tenant, source: "hour" };
  }
  if (raw === "rg-motors" || raw === "unidades-chile") {
    return { ok: true, tenant: raw, source: "query" };
  }
  return {
    ok: false,
    error: "Tenant inválido. Usá rg-motors o unidades-chile.",
  };
}
