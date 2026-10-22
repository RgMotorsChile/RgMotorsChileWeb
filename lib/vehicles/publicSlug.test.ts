import { describe, expect, it } from "vitest";
import catalog from "@/lib/vehicles/data/rgCatalog.json";
import { plateInSlug, publicVehicleSlug, scrubPlate } from "@/lib/vehicles/publicSlug";
import { publicationDecision } from "@/lib/vehicles/publication";
import { vehicleDocumentTitle, vehicleHeadline, vehicleMetaDescription } from "@/lib/seo/vehicleMeta";
import { vehicleJsonLd } from "@/lib/seo/vehicleJsonLd";
import { vehicleSpecBar } from "@/lib/vehicles/publicSpecs";
import { monthlyPayment } from "@/lib/finance/referentialQuote";
import type { Vehicle } from "@/lib/vehicles";

describe("publicVehicleSlug", () => {
  it("quita la patente y deja un id estable", () => {
    const slug = publicVehicleSlug({
      slug: "ford-edge-2017-jrth26",
      brand: "Ford",
      model: "EDGE",
      version: "EDGE · Negro",
      year: 2017,
      plate: "JRTH 26",
    });
    expect(slug).toMatch(/^ford-edge-negro-2017-[a-z0-9]{6}$/);
    expect(slug).not.toContain("jrth26");
    expect(publicVehicleSlug({
      slug: "ford-edge-2017-jrth26",
      brand: "Ford",
      model: "EDGE",
      version: "EDGE · Negro",
      year: 2017,
    })).toBe(slug);
  });

  it("no reescribe un slug que ya no trae patente", () => {
    expect(publicVehicleSlug({ slug: "demo", brand: "Toyota", model: "Yaris", year: 2020, plate: "ABCD12" })).toBe("demo");
  });

  it("el catálogo publicado queda sin patentes repetidas", () => {
    const next = catalog.map((row) => publicVehicleSlug(row));
    expect(new Set(next).size).toBe(next.length);
    for (const row of catalog) {
      const plate = plateInSlug(row.slug);
      const slug = publicVehicleSlug(row);
      expect(slug.includes(plate)).toBe(false);
      const decision = publicationDecision(row.slug, row);
      if (decision.type === "redirect" && decision.to.startsWith("/")) {
        expect(decision.to.endsWith(slug)).toBe(true);
      }
    }
  });
});

describe("ficha pública", () => {
  const edge = {
    slug: "ford-edge-negro-2017-abcdef",
    brand: "Ford",
    model: "EDGE",
    version: "EDGE · Negro",
    year: 2017,
    price: 11990000,
    km: 0,
    fuel: "Por confirmar",
    transmission: "Por confirmar",
    traction: "",
    plate: "JRTH26",
    image: "https://example.com/ford-edge-2017-jrth26/cover.jpg",
    bodyType: "SUV",
    location: "Puerto Montt",
    engine: "",
    power: "",
    doors: 4,
  } as Vehicle;

  it("muestra solo los datos que existen", () => {
    expect(vehicleSpecBar(edge).map((row) => row.label)).toEqual(["Versión", "Año"]);
    expect(vehicleSpecBar({ ...edge, km: 88000, fuel: "Bencina", transmission: "Automática", traction: "4x4" }).map((row) => row.label)).toEqual([
      "Kilómetros",
      "Versión",
      "Año",
      "Combustible",
      "Transmisión",
      "Tracción",
    ]);
  });

  it("el título, la descripción y el schema no llevan patente", () => {
    const title = vehicleDocumentTitle(edge);
    const description = vehicleMetaDescription(edge);
    expect(title).toBe("Ford Edge Negro 2017 usado en Puerto Montt | RG Motors");
    expect(description).toMatch(/11[.\s\u00a0]?990[.\s\u00a0]?000/);
    expect(description.toLowerCase()).toContain("whatsapp");
    expect(title + description).not.toMatch(/jrth/i);
    const json = JSON.stringify(vehicleJsonLd(edge));
    expect(json).not.toMatch(/jrth/i);
    expect(json).not.toContain("\"image\"");
    expect(json).toContain("\"@type\":\"Car\"");
    expect(json).toContain("\"@type\":\"Offer\"");
    expect(json).toContain("\"priceCurrency\":\"CLP\"");
    expect(json).toContain("BreadcrumbList");
    expect(json).toContain("WebSite");
    expect(json).not.toContain("mileageFromOdometer");
    expect(scrubPlate("Ford JRTH26", "JRTH26")).toBe("Ford");
    expect(vehicleHeadline(edge)).toBe("Ford Edge Negro 2017");
  });
});

describe("cuota referencial", () => {
  it("calcula una cuota francesa positiva", () => {
    const cuota = monthlyPayment(8_000_000, 48);
    expect(cuota).toBeGreaterThan(100_000);
    expect(cuota).toBeLessThan(8_000_000);
  });
});
