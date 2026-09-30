import { describe, expect, it } from "vitest";
import {
  PUBLIC_CATALOG_COLUMNS,
  STAFF_CATALOG_COLUMNS,
  catalogSelectList,
} from "@/lib/server/catalogSupabase";
import { stripPlateForPublic } from "@/lib/vehicles/publicFields";
import type { Vehicle } from "@/lib/vehicles";

const HIDDEN_FROM_PUBLIC = [
  "supplier",
  "payload",
  "tech_review",
  "circ_permit",
  "cover_locked",
  "list_price",
  "plate",
  "plate_norm",
  "tenant_id",
] as const;

describe("catalogSelectList", () => {
  it("la lectura pública no pide columnas internas", () => {
    const cols = catalogSelectList("public").split(",");
    expect(cols).toEqual([...PUBLIC_CATALOG_COLUMNS]);
    for (const hidden of HIDDEN_FROM_PUBLIC) {
      expect(cols).not.toContain(hidden);
    }
  });

  it("la lectura de staff es explícita y tampoco pide payload", () => {
    const cols = catalogSelectList("staff").split(",");
    expect(cols).toEqual([...STAFF_CATALOG_COLUMNS]);
    expect(cols).toContain("plate");
    expect(cols).toContain("supplier");
    expect(cols).toContain("cover_locked");
    expect(cols).toContain("list_price");
    expect(cols).not.toContain("payload");
    expect(cols).not.toContain("*");
  });
});

describe("stripPlateForPublic", () => {
  it("saca patente y campos internos del objeto que viaja al HTML", () => {
    const v = {
      slug: "demo",
      brand: "Toyota",
      model: "Hilux",
      version: "SR",
      year: 2022,
      price: 15_000_000,
      listPrice: 16_000_000,
      km: 1000,
      fuel: "Diésel",
      transmission: "Manual",
      bodyType: "Camioneta",
      location: "Puerto Montt",
      image: "/cars/x.jpg",
      engine: "2.4",
      power: "150 HP",
      traction: "4x4",
      doors: 4,
      owners: 1,
      plate: "ABCD12",
      supplier: "Patio",
      techReview: "Al día",
      circPermit: "Al día",
      coverLocked: true,
      highlights: ["Fotos reales"],
    } as Vehicle & { payload?: unknown };

    const pub = stripPlateForPublic({ ...v, payload: { secret: true } });
    expect(pub.slug).toBe("demo");
    expect(pub.price).toBe(15_000_000);
    expect(pub.highlights).toEqual(["Fotos reales"]);
    expect(pub).not.toHaveProperty("plate");
    expect(pub).not.toHaveProperty("listPrice");
    expect(pub).not.toHaveProperty("supplier");
    expect(pub).not.toHaveProperty("techReview");
    expect(pub).not.toHaveProperty("circPermit");
    expect(pub).not.toHaveProperty("coverLocked");
    expect(pub).not.toHaveProperty("payload");
    expect(pub).not.toHaveProperty("owners");
    expect(pub).not.toHaveProperty("ownersCount");
  });
});
