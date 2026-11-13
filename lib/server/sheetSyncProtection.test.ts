import { describe, expect, it } from "vitest";
import { Vehicle } from "@/lib/vehicles";
import {
  canLeaveCatalogBySheet,
  findPanelVehicleForSheetRow,
  isInactiveStatus,
  normalizePlate,
  vehiclesToKeep,
} from "@/lib/server/sheetSyncProtection";

function vehicle(
  partial: Partial<Vehicle> & Pick<Vehicle, "slug" | "brand" | "model" | "year">,
): Vehicle {
  return {
    version: partial.model,
    price: 10_000_000,
    km: 12_000,
    fuel: "Por confirmar",
    transmission: "Por confirmar",
    bodyType: "SUV",
    location: "Puerto Montt",
    image: "/images/placeholder-pending-car.svg",
    engine: "Por confirmar",
    power: "Por confirmar",
    traction: "Por confirmar",
    doors: 4,
    status: "Disponible",
    ...partial,
  };
}

describe("normalizePlate", () => {
  it("pasa a mayúsculas y deja solo A-Z0-9", () => {
    expect(normalizePlate("ab-cd 12")).toBe("ABCD12");
    expect(normalizePlate("  rg.12-ab ")).toBe("RG12AB");
    expect(normalizePlate("thzf75")).toBe("THZF75");
  });

  it("descarta vacío, nulo y caracteres que no son A-Z0-9", () => {
    expect(normalizePlate("")).toBe("");
    expect(normalizePlate(null)).toBe("");
    expect(normalizePlate(undefined)).toBe("");
    expect(normalizePlate("  -./ ")).toBe("");
    expect(normalizePlate("áb-12")).toBe("B12");
  });
});

describe("isInactiveStatus", () => {
  it("marca Vendido, Borrador y En preparación", () => {
    expect(isInactiveStatus("Vendido")).toBe(true);
    expect(isInactiveStatus("Borrador")).toBe(true);
    expect(isInactiveStatus("  En preparación  ")).toBe(true);
  });

  it("asume Disponible cuando no hay estado", () => {
    expect(isInactiveStatus(undefined)).toBe(false);
    expect(isInactiveStatus(null)).toBe(false);
    expect(isInactiveStatus("")).toBe(false);
    expect(isInactiveStatus("Disponible")).toBe(false);
    expect(isInactiveStatus("En reserva")).toBe(false);
  });
});

describe("canLeaveCatalogBySheet", () => {
  it("no deja salir un auto sin patente normalizada", () => {
    expect(canLeaveCatalogBySheet({ plate: "", status: "Disponible" })).toBe(false);
    expect(canLeaveCatalogBySheet({ plate: "  -  ", status: "Disponible" })).toBe(false);
    expect(canLeaveCatalogBySheet({ status: "Disponible" })).toBe(false);
  });

  it("deja salir solo con patente y estado activo", () => {
    expect(canLeaveCatalogBySheet({ plate: "ABCD12", status: "Disponible" })).toBe(true);
    expect(canLeaveCatalogBySheet({ plate: "ab-cd 12" })).toBe(true);
    expect(canLeaveCatalogBySheet({ plate: "ABCD12", status: "En reserva" })).toBe(true);
  });

  it("retiene vendido, borrador y en preparación aunque tengan patente", () => {
    expect(canLeaveCatalogBySheet({ plate: "ABCD12", status: "Vendido" })).toBe(false);
    expect(canLeaveCatalogBySheet({ plate: "ABCD12", status: "Borrador" })).toBe(false);
    expect(canLeaveCatalogBySheet({ plate: "ABCD12", status: "En preparación" })).toBe(false);
  });
});

describe("findPanelVehicleForSheetRow", () => {
  const row = { brand: "Citroën", model: "BERLINGO", year: 2021 };

  it("adopta el único auto sin patente, de la misma marca y año, con modelo contenido", () => {
    const match = vehicle({
      slug: "berlingo-panel",
      brand: "CITROEN",
      model: "Berlingo",
      year: 2021,
      plate: "",
    });
    const other = vehicle({
      slug: "hilux-panel",
      brand: "Toyota",
      model: "Hilux",
      year: 2021,
      plate: " ",
    });
    expect(findPanelVehicleForSheetRow(row, [other, match], new Set())).toBe(match);
  });

  it("acepta modelo que contiene o está contenido en el de la fila", () => {
    const longer = vehicle({
      slug: "katana-larga",
      brand: "Mitsubishi",
      model: "NEW KATANA",
      year: 2024,
    });
    const shorter = vehicle({
      slug: "katana-corta",
      brand: "Mitsubishi",
      model: "Katana",
      year: 2020,
    });
    expect(
      findPanelVehicleForSheetRow(
        { brand: "Mitsubishi", model: "KATANA", year: 2024 },
        [longer],
        new Set(),
      ),
    ).toBe(longer);
    expect(
      findPanelVehicleForSheetRow(
        { brand: "Mitsubishi", model: "NEW KATANA 4X4", year: 2020 },
        [shorter],
        new Set(),
      ),
    ).toBe(shorter);
  });

  it("no adopta si hay cero o más de un candidato", () => {
    const a = vehicle({ slug: "a", brand: "Citroen", model: "Berlingo", year: 2021 });
    const b = vehicle({ slug: "b", brand: "Citroën", model: "Berlingo Multispace", year: 2021 });
    expect(findPanelVehicleForSheetRow(row, [a, b], new Set())).toBeUndefined();
    expect(findPanelVehicleForSheetRow(row, [], new Set())).toBeUndefined();
  });

  it("ignora vendidos, con patente, ya adoptados, otro año u otra marca", () => {
    const sold = vehicle({
      slug: "vendido",
      brand: "Citroen",
      model: "Berlingo",
      year: 2021,
      status: "Vendido",
    });
    const plated = vehicle({
      slug: "con-patente",
      brand: "Citroen",
      model: "Berlingo",
      year: 2021,
      plate: "AB-CD12",
    });
    const otherYear = vehicle({
      slug: "otro-ano",
      brand: "Citroen",
      model: "Berlingo",
      year: 2020,
    });
    const otherBrand = vehicle({
      slug: "otra-marca",
      brand: "Peugeot",
      model: "Berlingo",
      year: 2021,
    });
    const adopted = vehicle({
      slug: "ya-adoptado",
      brand: "Citroen",
      model: "Berlingo",
      year: 2021,
    });
    const pool = [sold, plated, otherYear, otherBrand, adopted];
    expect(findPanelVehicleForSheetRow(row, pool, new Set(["ya-adoptado"]))).toBeUndefined();
    expect(findPanelVehicleForSheetRow(row, pool, new Set())).toBe(adopted);
  });

  it("si uno de dos candidatos ya fue adoptado, devuelve el otro", () => {
    const first = vehicle({ slug: "uno", brand: "Toyota", model: "Yaris", year: 2019 });
    const second = vehicle({ slug: "dos", brand: "Toyota", model: "Yaris Sport", year: 2019 });
    expect(
      findPanelVehicleForSheetRow(
        { brand: "Toyota", model: "YARIS", year: 2019 },
        [first, second],
        new Set(["uno"]),
      ),
    ).toBe(second);
  });

  it("un borrador sin patente sí puede recibir la patente de la fila", () => {
    const draft = vehicle({
      slug: "borrador",
      brand: "Ssang Yong",
      model: "Korando",
      year: 2022,
      status: "Borrador",
    });
    expect(
      findPanelVehicleForSheetRow(
        { brand: "SSANGYONG", model: "KORANDO", year: 2022 },
        [draft],
        new Set(),
      ),
    ).toBe(draft);
  });

  it("no calza modelo o marca vacíos", () => {
    const blankModel = vehicle({ slug: "sin-modelo", brand: "Toyota", model: " - ", year: 2022 });
    expect(
      findPanelVehicleForSheetRow(
        { brand: "Toyota", model: "HILUX", year: 2022 },
        [blankModel],
        new Set(),
      ),
    ).toBeUndefined();
    expect(
      findPanelVehicleForSheetRow(
        { brand: "Toyota", model: "", year: 2022 },
        [vehicle({ slug: "hilux", brand: "Toyota", model: "Hilux", year: 2022 })],
        new Set(),
      ),
    ).toBeUndefined();
  });
});

describe("vehiclesToKeep", () => {
  const current = [
    vehicle({ slug: "queda", brand: "Toyota", model: "Yaris", year: 2018 }),
    vehicle({ slug: "ya-en-lista", brand: "Kia", model: "Rio", year: 2020 }),
    vehicle({ slug: "archivado", brand: "Nissan", model: "Navara", year: 2019 }),
  ];

  it("conserva los actuales que no están en la lista nueva ni en los archivados", () => {
    const next = [current[1]];
    const kept = vehiclesToKeep(current, next, new Set(["archivado"]));
    expect(kept.map((v) => v.slug)).toEqual(["queda"]);
  });

  it("no devuelve nada si todos fueron reescritos o archivados", () => {
    expect(vehiclesToKeep(current, current, new Set())).toEqual([]);
    expect(vehiclesToKeep(current, [], new Set(current.map((v) => v.slug)))).toEqual([]);
    expect(vehiclesToKeep([], [current[0]], new Set())).toEqual([]);
  });
});
