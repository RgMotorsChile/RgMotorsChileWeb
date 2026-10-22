import { describe, expect, it } from "vitest";
import catalog from "@/lib/vehicles/data/rgCatalog.json";
import { readFileSync } from "node:fs";
import redirects from "@/lib/vehicles/publicationRedirects.json";
import { plateInSlug, publicVehicleSlug, scrubPlate } from "@/lib/vehicles/publicSlug";
import { publicationDecision } from "@/lib/vehicles/publication";
import { STOCK_SUCURSAL_CSV } from "@/lib/vehicles/stockSucursalCsv";
import { stockRowFor } from "@/lib/vehicles/stockSucursal";
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
      const decision = publicationDecision(row.slug, row);
      expect(slug.includes(plate)).toBe(false);
      if (decision.type === "redirect" && decision.to.startsWith("/")) {
        expect(decision.to.endsWith(slug)).toBe(true);
      }
    }
  });

  it("el Ranger SHYL53 queda en RG con el slug nuevo", () => {
    const ranger = catalog.find((row) => row.slug.endsWith("shyl53"));
    expect(ranger).toBeTruthy();
    expect(stockRowFor(ranger!).sitio).toBe("rg");
    expect(publicVehicleSlug(ranger!)).toBe("ford-ranger-4x4-rojo-2023-7cm3a8");
    expect(publicationDecision(ranger!.slug, ranger!)).toEqual({
      type: "redirect",
      to: "/vehiculo/ford-ranger-4x4-rojo-2023-7cm3a8",
    });
    expect(publicationDecision("ford-ranger-4x4-rojo-2023-7cm3a8", ranger!).type).toBe("render");
    expect(redirects.redirects).toContainEqual({
      source: "/vehiculo/ford-ranger-4x4-2023-shyl53",
      destination: "/vehiculo/ford-ranger-4x4-rojo-2023-7cm3a8",
    });
    expect(redirects.redirects.some((item) => item.destination.includes("unidadeschile"))).toBe(false);
    expect(redirects.gone.some((path) => path.includes("shyl53"))).toBe(false);
  });

  it("la UBICACION manda y el Edge sigue activo en RG", () => {
    const edge = catalog.find((item) => item.slug.endsWith("jrth26"));
    expect(stockRowFor(edge!).sitio).toBe("rg+salgado");
    expect(publicVehicleSlug(edge!)).toBe("ford-edge-negro-2017-y55fqc");
    expect(publicationDecision(edge!.slug, edge!)).toEqual({
      type: "redirect",
      to: "/vehiculo/ford-edge-negro-2017-y55fqc",
    });
    expect(publicationDecision("ford-edge-negro-2017-y55fqc", edge!).type).toBe("render");
    expect(redirects.redirects).toContainEqual({
      source: "/vehiculo/ford-edge-2017-jrth26",
      destination: "/vehiculo/ford-edge-negro-2017-y55fqc",
    });

    const tracker = catalog.find((item) => item.slug.endsWith("rzkv76"));
    expect(stockRowFor(tracker!).sitio).toBe("rg+uc+salgado");
    expect(publicationDecision(tracker!.slug, tracker!).type).toBe("redirect");

    for (const plate of ["ghtd24", "hlxb59", "jrth26", "lwrs59", "trbx87", "rzkv76", "y55fqc"]) {
      expect(redirects.gone.some((path) => path.includes(plate)), plate).toBe(false);
    }
    expect(redirects.gone).toEqual([]);
  });

  it("el CSV de docs es el que lee el sitio", () => {
    expect(readFileSync("docs/stock-sucursal.csv", "utf8")).toBe(STOCK_SUCURSAL_CSV);
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
