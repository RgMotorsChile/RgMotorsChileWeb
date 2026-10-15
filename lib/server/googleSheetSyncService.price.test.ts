import { describe, expect, it } from "vitest";
import { isSellableSheetRow } from "@/lib/server/sheetSyncGuards";
import { parsePrice } from "@/lib/server/googleSheetSyncService";

describe("parsePrice", () => {
  it("lee la oferta 7990 de PHZD48 como $7.990.000 junto a la lista en pesos", () => {
    const parsed = parsePrice(7990, "$8.490.000");
    expect(parsed).toEqual({ price: 7_990_000, listPrice: 8_490_000 });
    expect(
      isSellableSheetRow({
        price: parsed.price,
        km: 117_623,
        brand: "Citroen",
        model: "BERLINGO",
        year: 2021,
        rawParts: ["$8.490.000", 7990, "117.623 KM"],
      }),
    ).toBe(true);
  });

  it("acepta el mismo atajo si la celda viene como texto 7990", () => {
    expect(parsePrice("7990", "$8.490.000").price).toBe(7_990_000);
  });

  it("no convierte un precio que ya está en pesos", () => {
    expect(parsePrice("$15.990.000", "$17.990.000")).toEqual({
      price: 15_990_000,
      listPrice: 17_990_000,
    });
    expect(parsePrice("12.990.000 (iva incluido)", "11.990.000 (iva incluido)")).toEqual({
      price: 12_990_000,
      listPrice: undefined,
    });
  });

  it("no escala basura numérica ni notas de patio", () => {
    expect(parsePrice("CAMION 7/8", "").price).toBe(78);
    expect(parsePrice("CAMION 16-09", "CAMION 16-09").price).toBe(1609);
    expect(parsePrice(78, "$8.490.000").price).toBe(78);
    expect(parsePrice(2024, "$8.490.000").price).toBe(2024);
  });
});
