import { describe, expect, it } from "vitest";
import {
  evaluateSheetWipeGuard,
  guessBodyTypeFromModel,
  hasBlockedInventoryText,
  isSellableSheetRow,
} from "@/lib/server/sheetSyncGuards";

describe("isSellableSheetRow", () => {
  it("acepta fila con precio/km aunque la nota diga FOTOS NUEVAS", () => {
    expect(
      isSellableSheetRow({
        price: 14_990_000,
        km: 65_000,
        brand: "Mitsubishi",
        model: "NEW KATANA",
        year: 2024,
        rawParts: [15_990_000, 14_990_000, "65.000 km"],
      }),
    ).toBe(true);
  });

  it("acepta precio real aunque km aún no esté en la hoja", () => {
    expect(
      isSellableSheetRow({
        price: 39_990_000,
        km: 0,
        brand: "Subaru",
        model: "WRX STI",
        year: 2022,
      }),
    ).toBe(true);
  });

  it("rechaza basura numérica tipo CAMION 7/8", () => {
    expect(
      isSellableSheetRow({
        price: 78,
        km: 0,
        brand: "Maxus",
        model: "T60",
        year: 2023,
      }),
    ).toBe(false);
  });

  it("rechaza celda de precio 'FALTA FOTOS Y PRECIO'", () => {
    expect(hasBlockedInventoryText("FALTA FOTOS Y PRECIO")).toBe(true);
    expect(
      isSellableSheetRow({
        price: 0,
        km: 89_498,
        brand: "Mitsubishi",
        model: "KATANA 4X4",
        year: 2021,
        rawParts: ["FALTA FOTOS Y PRECIO", "FALTA FOTOS Y PRECIO", "89.498 km"],
      }),
    ).toBe(false);
  });

  it("no bloquea por nota FALTA REVISIÓN fuera de precio/km", () => {
    expect(hasBlockedInventoryText("FALTA REVISIÓN")).toBe(false);
  });
});

describe("evaluateSheetWipeGuard", () => {
  it("aborta sync si la hoja no trae activos", () => {
    const r = evaluateSheetWipeGuard({
      sheetActiveCount: 0,
      currentActiveCount: 30,
      wouldArchiveCount: 30,
    });
    expect(r.abortAll).toBe(true);
    expect(r.skipArchive).toBe(true);
  });

  it("omite archivo masivo ante caída >35%", () => {
    const r = evaluateSheetWipeGuard({
      sheetActiveCount: 10,
      currentActiveCount: 30,
      wouldArchiveCount: 20,
    });
    expect(r.abortAll).toBe(false);
    expect(r.skipArchive).toBe(true);
  });

  it("permite archivo normal con caída chica", () => {
    const r = evaluateSheetWipeGuard({
      sheetActiveCount: 28,
      currentActiveCount: 30,
      wouldArchiveCount: 2,
    });
    expect(r.abortAll).toBe(false);
    expect(r.skipArchive).toBe(false);
  });
});

describe("guessBodyTypeFromModel", () => {
  it("infiere camioneta sin inventar combustible", () => {
    expect(guessBodyTypeFromModel("HILUX 4X4")).toBe("Camioneta");
    expect(guessBodyTypeFromModel("MODELO RARO XYZ")).toBe("Por confirmar");
  });
});
