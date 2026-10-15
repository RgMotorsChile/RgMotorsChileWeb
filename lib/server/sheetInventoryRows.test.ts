import { describe, expect, it } from "vitest";
import { extractSheetVehicles } from "@/lib/server/googleSheetSyncService";

function car(
  plate: string,
  extra: unknown[] = [],
): unknown[] {
  return [
    "",
    plate,
    "TOYOTA",
    "HILUX",
    "BLANCO",
    2022,
    "$15.990.000",
    "$14.990.000",
    "100.000 KM",
    ...extra,
  ];
}

describe("extractSheetVehicles", () => {
  it("una fila vacía entre PSKJ78 y TSGL82 no corta la lectura", () => {
    const rows = [
      ["", "PATENTE", "MARCA", "MODELO"],
      car("PSKJ 78"),
      [],
      ["", null, "   "],
      car("TSGL82").map((cell, index) => (index === 3 ? "RAIZE" : cell)),
    ];

    const sellable = extractSheetVehicles(rows)
      .filter((row) => row.sellable)
      .map((row) => row.plate);

    expect(sellable).toEqual(["PSKJ78", "TSGL82"]);
  });

  it("deja fuera los autos bajo preparación, taller, Salgado y bloques ajenos", () => {
    const rows = [
      ["", "PATENTE", "MARCA", "MODELO"],
      car("PSKJ78"),
      [],
      car("TSGL82"),
      [],
      ["", "", "", "PREPARACIÓN"],
      car("RZJR40"),
      ["", "", "", "TALLER"],
      car("PJBL79"),
      ["", "", "", "DON RUDY"],
      car("TSKL58"),
      ["", "", "", "CONSIGNADOS CASA CLIENTE"],
      car("RHPH75"),
      ["", "", "", "SALGADO"],
      car("RWYR12"),
    ];

    const sellable = extractSheetVehicles(rows)
      .filter((row) => row.sellable)
      .map((row) => row.plate);

    expect(sellable).toEqual(["PSKJ78", "TSGL82"]);
    expect(sellable).not.toContain("RZJR40");
    expect(sellable).not.toContain("PJBL79");
    expect(sellable).not.toContain("TSKL58");
    expect(sellable).not.toContain("RHPH75");
    expect(sellable).not.toContain("RWYR12");
  });

  it("RESERVADA y sin precio siguen fuera, y no frenan el auto de abajo", () => {
    const rows = [
      ["", "PATENTE", "MARCA", "MODELO"],
      car("SVFD42").map((cell, i) =>
        i === 6 || i === 7 ? "RESERVADA" : cell,
      ),
      car("TCGB98"),
      car("LJCY66").map((cell, i) => (i === 6 || i === 7 || i === 8 ? "" : cell)),
    ];

    const parsed = extractSheetVehicles(rows);
    expect(parsed.map((row) => row.plate)).toEqual(["SVFD42", "TCGB98", "LJCY66"]);
    expect(parsed.filter((row) => row.sellable).map((row) => row.plate)).toEqual([
      "TCGB98",
    ]);
  });
});
