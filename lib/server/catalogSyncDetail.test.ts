import { describe, expect, it } from "vitest";
import { buildCatalogSyncDetail } from "./catalogSyncDetail";

describe("buildCatalogSyncDetail", () => {
  it("suma planilla y fotos", () => {
    const detail = buildCatalogSyncDetail({
      tenant: "rg-motors",
      durationMs: 1200,
      sheet: {
        success: true,
        rowsRead: 40,
        newVehicles: 2,
        updatedVehicles: 3,
        skippedIncomplete: 4,
      },
      drive: {
        success: true,
        newPhotosDownloaded: 6,
        syncedVehicles: 2,
        skippedUnchanged: 10,
        skippedCoverLocked: 1,
        deferredVehicles: 2,
      },
    });
    expect(detail).toMatchObject({
      tenant: "rg-motors",
      read: 40,
      inserted: 2,
      updated: 5,
      skipped: 15,
      photos: 6,
      deferred: 2,
      errors: [],
      durationMs: 1200,
      success: true,
    });
  });

  it("registra el fallo aunque no haya contadores", () => {
    const detail = buildCatalogSyncDetail({
      tenant: "unidades-chile",
      durationMs: 80,
      thrown: "timeout",
    });
    expect(detail.success).toBe(false);
    expect(detail.errors).toEqual(["timeout"]);
    expect(detail.read).toBe(0);
    expect(detail.photos).toBe(0);
  });

  it("incluye el mensaje de la planilla cuando success es false", () => {
    const detail = buildCatalogSyncDetail({
      tenant: "rg-motors",
      durationMs: 10,
      sheet: { success: false, message: "hoja restringida", rowsRead: 0 },
      drive: { success: true, newPhotosDownloaded: 0 },
    });
    expect(detail.success).toBe(false);
    expect(detail.errors).toEqual(["hoja restringida"]);
  });
});
