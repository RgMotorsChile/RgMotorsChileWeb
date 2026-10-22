import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/lib/vehicles";

const getVehicles = vi.hoisted(() => vi.fn());
const loadDrivePhotosSyncState = vi.hoisted(() => vi.fn());
const syncDrivePhotosViaOAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/vehiclesStore", () => ({ getVehicles }));
vi.mock("@/lib/server/driveOAuthSyncService", () => ({
  loadDrivePhotosSyncState,
  syncDrivePhotosViaOAuth,
}));

import {
  parsePhotosResyncRequest,
  runPhotosResyncBatch,
  selectResyncSlugs,
} from "./photosResync";

const BLOB = "https://old.public.blob.vercel-storage.com/cars/uploads";

function vehicle(slug: string, image: string): Vehicle {
  return {
    slug,
    plate: "AAAA 11",
    brand: "Toyota",
    model: "Yaris",
    version: "",
    year: 2020,
    price: 1,
    km: 1,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    location: "Puerto Montt",
    image,
    gallery: [image],
    engine: "",
    power: "",
    traction: "",
    doors: 4,
    hasRealPhotos: true,
  };
}

describe("selectResyncSlugs", () => {
  it("sigue después del cursor, ignora Supabase y reemplazos manuales", () => {
    const manual = new Set([`${BLOB}/b.jpg`.split("?")[0]]);
    const selected = selectResyncSlugs({
      afterSlug: "a-car",
      limit: 1,
      manualBlobUrls: manual,
      vehicles: [
        vehicle("a-car", `${BLOB}/a.jpg`),
        vehicle("b-car", `${BLOB}/b.jpg`),
        vehicle("c-car", "https://tuybpizjeszgwtcvunmp.supabase.co/storage/v1/object/public/vehicle-photos/rg-motors/c-car/abc.jpg"),
        vehicle("d-car", `${BLOB}/d.jpg`),
      ],
    });
    expect(selected.pending).toBe(1);
    expect(selected.slugs).toEqual(["d-car"]);
  });
});

describe("parsePhotosResyncRequest", () => {
  it("rechaza limit y un cursor que no coincide con el tenant", () => {
    expect(parsePhotosResyncRequest({ limit: "0" }).ok).toBe(false);
    expect(parsePhotosResyncRequest({ limit: "9" }).ok).toBe(false);
    expect(
      parsePhotosResyncRequest({ cursor: "rg-motors:yaris", tenant: "unidades-chile" }).ok,
    ).toBe(false);
    const ok = parsePhotosResyncRequest({ tenant: "unidades-chile", limit: "2" });
    expect(ok).toEqual({
      ok: true,
      limit: 2,
      cursor: { tenant: "unidades-chile", afterSlug: "" },
    });
  });
});

describe("runPhotosResyncBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadDrivePhotosSyncState.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    syncDrivePhotosViaOAuth.mockResolvedValue({
      success: true,
      totalFolders: 1,
      syncedVehicles: 1,
      newPhotosDownloaded: 2,
      deferredVehicles: 0,
      message: "ok",
      vehicles: [],
    });
  });

  it("migra un lote y devuelve el cursor del último slug", async () => {
    getVehicles.mockResolvedValue([
      vehicle("alfa", `${BLOB}/alfa.jpg`),
      vehicle("beta", `${BLOB}/beta.jpg`),
    ]);
    const first = await runPhotosResyncBatch({
      cursor: "rg-motors",
      limit: 1,
      deadlineAt: 123,
      sync: syncDrivePhotosViaOAuth,
      loadState: loadDrivePhotosSyncState,
      listVehicles: getVehicles,
    });
    expect(first.ok).toBe(true);
    expect(first.done).toBe(false);
    expect(first.batch).toEqual(["alfa"]);
    expect(first.nextCursor).toBe("rg-motors:alfa");
    expect(syncDrivePhotosViaOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: "rg-motors",
        migrateBlobUrls: true,
        maxBlobHeadChecks: 0,
        onlySlugs: ["alfa"],
        deadlineAt: 123,
      }),
    );

    getVehicles.mockResolvedValue([vehicle("beta", `${BLOB}/beta.jpg`)]);
    const second = await runPhotosResyncBatch({
      cursor: first.nextCursor,
      limit: 1,
      sync: syncDrivePhotosViaOAuth,
      loadState: loadDrivePhotosSyncState,
      listVehicles: getVehicles,
    });
    expect(second.batch).toEqual(["beta"]);
    expect(second.nextCursor).toBe("rg-motors:beta");
  });

  it("al terminar un tenant pasa al otro y después cierra", async () => {
    getVehicles.mockResolvedValue([vehicle("ya", "https://cdn.example/ya.jpg")]);
    const rg = await runPhotosResyncBatch({
      listVehicles: getVehicles,
      loadState: loadDrivePhotosSyncState,
      sync: syncDrivePhotosViaOAuth,
    });
    expect(rg.done).toBe(false);
    expect(rg.nextCursor).toBe("unidades-chile");
    expect(syncDrivePhotosViaOAuth).not.toHaveBeenCalled();

    const uc = await runPhotosResyncBatch({
      cursor: rg.nextCursor,
      listVehicles: getVehicles,
      loadState: loadDrivePhotosSyncState,
      sync: syncDrivePhotosViaOAuth,
    });
    expect(uc.done).toBe(true);
    expect(uc.nextCursor).toBeNull();
  });

  it("si el lote no cabe, repite el mismo cursor", async () => {
    getVehicles.mockResolvedValue([vehicle("alfa", `${BLOB}/alfa.jpg`)]);
    syncDrivePhotosViaOAuth.mockResolvedValue({
      success: true,
      syncedVehicles: 0,
      newPhotosDownloaded: 0,
      deferredVehicles: 1,
      message: "queda",
      vehicles: [],
      totalFolders: 1,
    });
    const again = await runPhotosResyncBatch({
      cursor: "rg-motors",
      limit: 1,
      sync: syncDrivePhotosViaOAuth,
      loadState: loadDrivePhotosSyncState,
      listVehicles: getVehicles,
    });
    expect(again.nextCursor).toBe("rg-motors");
    expect(again.deferredVehicles).toBe(1);
    expect(again.done).toBe(false);
  });

  it("un segundo llamado sin Blob pendiente no vuelve a subir", async () => {
    getVehicles.mockResolvedValue([
      vehicle("alfa", "https://tuybpizjeszgwtcvunmp.supabase.co/storage/v1/object/public/vehicle-photos/rg-motors/alfa/abc.jpg"),
    ]);
    const done = await runPhotosResyncBatch({
      cursor: "unidades-chile",
      stopAfterTenant: "unidades-chile",
      sync: syncDrivePhotosViaOAuth,
      loadState: loadDrivePhotosSyncState,
      listVehicles: getVehicles,
    });
    expect(done.done).toBe(true);
    expect(done.newPhotosDownloaded).toBe(0);
    expect(syncDrivePhotosViaOAuth).not.toHaveBeenCalled();
  });
});
