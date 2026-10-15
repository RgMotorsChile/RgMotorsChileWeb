import { describe, expect, it } from "vitest";
import { resolveCronTenant } from "./cronTenant";

describe("resolveCronTenant", () => {
  const at = (iso: string) => new Date(iso);

  it("acepta el tenant explícito", () => {
    expect(resolveCronTenant("rg-motors", at("2026-10-15T12:00:00.000Z"))).toEqual({
      ok: true,
      tenant: "rg-motors",
      source: "query",
    });
    expect(
      resolveCronTenant("unidades-chile", at("2026-10-15T11:00:00.000Z")),
    ).toEqual({
      ok: true,
      tenant: "unidades-chile",
      source: "query",
    });
  });

  it("recorta espacios del parámetro", () => {
    expect(resolveCronTenant("  unidades-chile  ", at("2026-10-15T08:00:00.000Z"))).toEqual({
      ok: true,
      tenant: "unidades-chile",
      source: "query",
    });
  });

  it("sin parámetro, 12 UTC es Unidades Chile y el resto RG", () => {
    expect(resolveCronTenant(null, at("2026-10-15T12:30:00.000Z"))).toEqual({
      ok: true,
      tenant: "unidades-chile",
      source: "hour",
    });
    expect(resolveCronTenant(undefined, at("2026-10-15T11:00:00.000Z"))).toEqual({
      ok: true,
      tenant: "rg-motors",
      source: "hour",
    });
    expect(resolveCronTenant("", at("2026-10-15T22:00:00.000Z"))).toEqual({
      ok: true,
      tenant: "rg-motors",
      source: "hour",
    });
  });

  it("rechaza un tenant desconocido en vez de caer al reloj", () => {
    const result = resolveCronTenant("salgado", at("2026-10-15T12:00:00.000Z"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/rg-motors/);
    }
  });
});
