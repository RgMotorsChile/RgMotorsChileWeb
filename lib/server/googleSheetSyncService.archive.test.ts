import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/lib/vehicles";
import * as XLSX from "xlsx";

/**
 * Corrida real de unidades-chile (actions/runs/43487752689):
 * "22 listos, 5 vendidos archivados", antiWipeSkippedArchive false,
 * pero PSJJ97, SSDD57, SBZG55, THLV62 y RZVK91 siguieron Disponibles.
 * shouldReleaseRemovedVehicle rechazaba todo tenant distinto de rg-motors,
 * no los metía en removedSlugs y vehiclesToKeep los devolvía al catálogo.
 */

const getVehicles = vi.hoisted(() => vi.fn());
const replaceAllVehicles = vi.hoisted(() => vi.fn());
const archiveSoldVehicle = vi.hoisted(() => vi.fn());
const getSoldVehicles = vi.hoisted(() => vi.fn());
const httpsGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/vehiclesStore", () => ({
  getVehicles,
  replaceAllVehicles,
}));

vi.mock("@/lib/server/soldVehiclesStore", () => ({
  archiveSoldVehicle,
  getSoldVehicles,
}));

vi.mock("node:https", () => ({
  default: { get: httpsGet },
  get: httpsGet,
}));

import { syncFromLiveGoogleSheet } from "./googleSheetSyncService";

const LEFT_UC_SHEET = ["PSJJ97", "SSDD57", "SBZG55", "THLV62", "RZVK91"] as const;

const PHOTO =
  "https://tuybpizjeszgwtcvunmp.supabase.co/storage/v1/object/public/vehicle-photos/unidades-chile/peugeot-partner-2021-psjj97/cover.jpg";

function vehicle(
  partial: Partial<Vehicle> & Pick<Vehicle, "slug">,
): Vehicle {
  return {
    brand: "Peugeot",
    model: "PARTNER",
    version: "PARTNER · Blanco",
    year: 2022,
    price: 8_990_000,
    km: 80_000,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Furgón",
    location: "Puerto Montt · Av. Cardonal",
    image: PHOTO,
    gallery: [PHOTO],
    engine: "1.5L BlueHDi",
    power: "100 HP",
    traction: "4x2",
    doors: 5,
    status: "Disponible",
    hasRealPhotos: true,
    coverLocked: true,
    ...partial,
  };
}

function plateOf(v: Vehicle): string {
  return String(v.plate || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function sheetRow(plate: string, brand = "Toyota", model = "HILUX"): unknown[] {
  return ["", plate, brand, model, "Blanco", 2022, 10_990_000, 9_990_000, 50_000, "ECONO"];
}

function workbookBuffer(tabs: Record<string, unknown[][]>): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(tabs)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function serveSheet(buffer: Buffer) {
  httpsGet.mockImplementation(
    (_url: string, _opts: unknown, cb?: (res: EventEmitter) => void) => {
      const listener = typeof _opts === "function" ? _opts : cb;
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = 200;
      res.headers = {};
      queueMicrotask(() => {
        listener?.(res);
        res.emit("data", buffer);
        res.emit("end");
      });
      return new EventEmitter();
    },
  );
}

function savedVehicles(): Vehicle[] {
  const list = replaceAllVehicles.mock.calls.at(-1)?.[0] as Vehicle[] | undefined;
  expect(list, "replaceAllVehicles no fue llamado").toBeTruthy();
  return list || [];
}

describe("syncFromLiveGoogleSheet archiva los que salen de la planilla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSoldVehicles.mockResolvedValue([]);
    archiveSoldVehicle.mockResolvedValue({ success: true });
    replaceAllVehicles.mockResolvedValue({ success: true, count: 1 });
  });

  it("unidades-chile archiva las 5 patentes que salieron y no las vuelve a dejar Disponibles", async () => {
    const gone = LEFT_UC_SHEET.map((plate, index) =>
      vehicle({
        slug: `salio-${plate.toLowerCase()}`,
        plate: `${plate.slice(0, 4)} ${plate.slice(4)}`,
        brand: index === 4 ? "Toyota" : "Peugeot",
        model: index === 4 ? "HILUX 4X4" : "PARTNER",
        gallery: [`${PHOTO}?plate=${plate}`],
        image: `${PHOTO}?plate=${plate}`,
        coverLocked: true,
      }),
    );
    const stayers = Array.from({ length: 10 }, (_, index) => {
      const plate = `ST${String(index).padStart(4, "0")}`;
      return vehicle({
        slug: `sigue-${plate.toLowerCase()}`,
        plate,
        brand: "Mazda",
        model: "BT 50",
        image: `${PHOTO}?stay=${plate}`,
        gallery: [`${PHOTO}?stay=${plate}`, `${PHOTO}?stay=${plate}&side=1`],
        coverLocked: plate === "ST0000",
      });
    });
    const panel = vehicle({
      slug: "panel-sin-patente",
      plate: "",
      brand: "Citroen",
      model: "BERLINGO",
      coverLocked: false,
    });
    const draft = vehicle({
      slug: "borrador-con-patente",
      plate: "BRDR12",
      status: "Borrador",
      brand: "SsangYong",
      model: "KORANDO",
    });
    const preparing = vehicle({
      slug: "en-preparacion",
      plate: "PREP12",
      status: "En preparación",
      brand: "Nissan",
      model: "NAVARA",
    });
    const freshPlates = Array.from({ length: 7 }, (_, index) => `NW${String(index).padStart(4, "0")}`);

    getVehicles.mockResolvedValue([...gone, ...stayers, panel, draft, preparing]);
    serveSheet(
      workbookBuffer({
        "UNIDADES CHILE": [
          ["#", "PATENTE", "MARCA", "MODELO", "COLOR", "AÑO", "LISTA", "OFERTA", "KM", "PROVEEDOR"],
          ...stayers.map((v) => sheetRow(plateOf(v), v.brand, v.model)),
          ...freshPlates.map((plate) => sheetRow(plate)),
        ],
        "RG MOTORS": [
          ["#", "PATENTE", "MARCA", "MODELO", "COLOR", "AÑO", "LISTA", "OFERTA", "KM", "PROVEEDOR"],
          sheetRow("PSJJ97", "Peugeot", "PARTNER"),
        ],
      }),
    );

    const report = await syncFromLiveGoogleSheet(undefined, { tenantSlug: "unidades-chile" });

    expect(report.success).toBe(true);
    expect(report.antiWipeSkippedArchive).toBe(false);
    expect(report.soldVehicles).toBe(LEFT_UC_SHEET.length);
    expect(getVehicles).toHaveBeenCalledWith({
      bypassCache: true,
      tenantSlug: "unidades-chile",
      scope: "staff",
    });

    const archivedPlates = archiveSoldVehicle.mock.calls
      .map((call) => plateOf(call[0] as Vehicle))
      .sort();
    expect(archivedPlates).toEqual([...LEFT_UC_SHEET].sort());
    for (const call of archiveSoldVehicle.mock.calls) {
      const archived = call[0] as Vehicle;
      expect(archived.gallery?.length).toBeGreaterThan(0);
      expect(archived.image).toContain("supabase.co");
      expect(archived.coverLocked).toBe(true);
    }

    const kept = savedVehicles();
    const keptPlates = kept.map(plateOf);
    for (const plate of LEFT_UC_SHEET) {
      expect(keptPlates).not.toContain(plate);
    }
    expect(kept.find((v) => v.slug === "panel-sin-patente")?.status).toBe("Disponible");
    expect(kept.find((v) => v.slug === "borrador-con-patente")?.status).toBe("Borrador");
    expect(kept.find((v) => v.slug === "en-preparacion")?.status).toBe("En preparación");
    const locked = kept.find((v) => v.slug === "sigue-st0000");
    expect(locked?.coverLocked).toBe(true);
    expect(locked?.image).toBe(`${PHOTO}?stay=ST0000`);
    expect(locked?.gallery).toEqual([
      `${PHOTO}?stay=ST0000`,
      `${PHOTO}?stay=ST0000&side=1`,
    ]);
    for (const plate of freshPlates) {
      expect(keptPlates).toContain(plate);
    }
    expect(replaceAllVehicles).toHaveBeenCalledWith(
      expect.any(Array),
      { tenantSlug: "unidades-chile" },
    );
  });

  it("el anti-wipe de unidades-chile no archiva aunque falten varias patentes", async () => {
    const stock = Array.from({ length: 8 }, (_, index) => {
      const plate = `UC${String(index).padStart(4, "0")}`;
      return vehicle({ slug: `uc-${plate.toLowerCase()}`, plate, brand: "Ford", model: "RANGER" });
    });
    getVehicles.mockResolvedValue(stock);
    serveSheet(
      workbookBuffer({
        "UNIDADES CHILE": [
          ["#", "PATENTE", "MARCA", "MODELO", "COLOR", "AÑO", "LISTA", "OFERTA", "KM", "PROVEEDOR"],
          sheetRow(plateOf(stock[0]), "Ford", "RANGER"),
        ],
      }),
    );

    const report = await syncFromLiveGoogleSheet(undefined, { tenantSlug: "unidades-chile" });

    expect(report.success).toBe(true);
    expect(report.antiWipeSkippedArchive).toBe(true);
    expect(report.soldVehicles).toBe(0);
    expect(archiveSoldVehicle).not.toHaveBeenCalled();
    const keptPlates = savedVehicles().map(plateOf).sort();
    expect(keptPlates).toEqual(stock.map(plateOf).sort());
  });

  it("rg-motors sigue archivando el auto que salió de su pestaña", async () => {
    const gone = vehicle({ slug: "rg-salio", plate: "PSJJ 97", brand: "Peugeot", model: "PARTNER" });
    const stays = Array.from({ length: 10 }, (_, index) => {
      const plate = `RG${String(index).padStart(4, "0")}`;
      return vehicle({ slug: `rg-${plate.toLowerCase()}`, plate, brand: "Toyota", model: "YARIS" });
    });
    const panel = vehicle({ slug: "rg-panel", plate: " - ", brand: "Kia", model: "RIO" });
    getVehicles.mockResolvedValue([gone, ...stays, panel]);
    serveSheet(
      workbookBuffer({
        "RG MOTORS": [
          ["#", "PATENTE", "MARCA", "MODELO", "COLOR", "AÑO", "LISTA", "OFERTA", "KM", "PROVEEDOR"],
          ...stays.map((v) => sheetRow(plateOf(v), v.brand, v.model)),
          ...Array.from({ length: 7 }, (_, index) => sheetRow(`RN${String(index).padStart(4, "0")}`, "Kia", "RIO")),
        ],
      }),
    );

    const report = await syncFromLiveGoogleSheet(undefined, { tenantSlug: "rg-motors" });

    expect(report.antiWipeSkippedArchive).toBe(false);
    expect(report.soldVehicles).toBe(1);
    expect(plateOf(archiveSoldVehicle.mock.calls[0][0] as Vehicle)).toBe("PSJJ97");
    const kept = savedVehicles();
    expect(kept.map(plateOf)).not.toContain("PSJJ97");
    expect(kept.some((v) => v.slug === "rg-panel")).toBe(true);
    const yaris = kept.find((v) => v.slug === "rg-rg0000");
    expect(yaris?.coverLocked).toBe(true);
    expect(yaris?.image).toBe(PHOTO);
  });
});
