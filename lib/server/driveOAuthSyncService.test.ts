import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/lib/vehicles";

const getVehicles = vi.hoisted(() => vi.fn());
const saveVehicle = vi.hoisted(() => vi.fn());
const storeMediaFile = vi.hoisted(() => vi.fn());
const downloadDriveFileBytes = vi.hoisted(() => vi.fn());
const listImagesInFolder = vi.hoisted(() => vi.fn());
const listPlateFolders = vi.hoisted(() => vi.fn());
const readJson = vi.hoisted(() => vi.fn());
const writeJson = vi.hoisted(() => vi.fn());
const blobStillExists = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/vehiclesStore", () => ({
  getVehicles,
  saveVehicle,
}));

vi.mock("@/lib/server/mediaStorage", () => ({
  storeMediaFile,
}));

vi.mock("@/lib/server/googleDriveClient", () => ({
  downloadDriveFileBytes,
  getDrivePhotosFolderId: () => "root-folder",
  isGoogleDriveOAuthConfigured: () => true,
  listImagesInFolder,
  listPlateFolders,
}));

vi.mock("@/lib/server/db", () => ({
  readJson,
  writeJson,
}));

vi.mock("@/lib/server/verifyPhotos", () => ({
  blobStillExists,
}));

import { syncDrivePhotosViaOAuth } from "./driveOAuthSyncService";

function vehicle(
  partial: Partial<Vehicle> & Pick<Vehicle, "slug" | "plate">,
): Vehicle {
  return {
    brand: "Toyota",
    model: "Yaris",
    version: "",
    year: 2020,
    price: 10_000_000,
    km: 10_000,
    fuel: "Bencina",
    transmission: "Manual",
    bodyType: "Sedán",
    location: "Puerto Montt",
    image: "/images/placeholder-pending-car.svg",
    engine: "",
    power: "",
    traction: "",
    doors: 4,
    hasRealPhotos: false,
    ...partial,
  };
}

describe("syncDrivePhotosViaOAuth coverLocked", () => {
  const locked = vehicle({
    slug: "locked-car",
    plate: "ABCD 12",
    coverLocked: true,
    hasRealPhotos: true,
    image: "https://cdn.example/locked-cover.jpg",
    gallery: ["https://cdn.example/locked-cover.jpg"],
  });
  const open = vehicle({
    slug: "open-car",
    plate: "EFGH 34",
    coverLocked: false,
    hasRealPhotos: false,
    image: "/images/placeholder-pending-car.svg",
    gallery: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getVehicles.mockResolvedValue([locked, open]);
    saveVehicle.mockResolvedValue({ success: true });
    readJson.mockResolvedValue({ lastRunAt: null, files: {} });
    writeJson.mockResolvedValue(undefined);
    blobStillExists.mockResolvedValue(true);
    listPlateFolders.mockResolvedValue([
      { id: "folder-locked", name: "ABCD12" },
      { id: "folder-open", name: "EFGH34" },
    ]);
    listImagesInFolder.mockImplementation(async (folderId: string) => {
      if (folderId === "folder-locked") {
        return [
          {
            id: "file-locked",
            name: "cover.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-10-01T00:00:00.000Z",
          },
        ];
      }
      if (folderId === "folder-open") {
        return [
          {
            id: "file-open",
            name: "1.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-10-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });
    downloadDriveFileBytes.mockResolvedValue(Buffer.from("img"));
    storeMediaFile.mockImplementation(
      async ({ relativePath }: { relativePath: string }) => ({
        url: `https://blob.example/${relativePath}`,
        relativePath: `/${relativePath}`,
        storage: "blob" as const,
      }),
    );
  });

  it("salta el vehículo con portada bloqueada y sincroniza el que no lo está", async () => {
    const result = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });

    expect(result.success).toBe(true);
    expect(result.syncedVehicles).toBe(1);
    expect(result.newPhotosDownloaded).toBe(1);

    expect(listImagesInFolder).not.toHaveBeenCalledWith("folder-locked");
    expect(listImagesInFolder).toHaveBeenCalledWith("folder-open");
    expect(downloadDriveFileBytes).not.toHaveBeenCalledWith("file-locked");
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-open");
    expect(storeMediaFile).toHaveBeenCalledTimes(1);
    expect(storeMediaFile).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: "cars/uploads/open-car/file-open.jpg",
      }),
    );

    expect(saveVehicle).toHaveBeenCalledTimes(1);
    const [saved, opts] = saveVehicle.mock.calls[0];
    expect(saved.slug).toBe("open-car");
    expect(saved.image).toBe(
      "https://blob.example/cars/uploads/open-car/file-open.jpg",
    );
    expect(saved.gallery).toEqual([
      "https://blob.example/cars/uploads/open-car/file-open.jpg",
    ]);
    expect(opts).toEqual({ tenantSlug: "rg-motors" });
    expect(saveVehicle.mock.calls.some((call) => call[0]?.slug === "locked-car")).toBe(
      false,
    );
  });

  it("también omite coverLocked en Unidades Chile, que usa la misma sync", async () => {
    await syncDrivePhotosViaOAuth({ tenantSlug: "unidades-chile" });

    expect(getVehicles).toHaveBeenCalledWith({
      tenantSlug: "unidades-chile",
      bypassCache: true,
      scope: "staff",
    });
    expect(saveVehicle).toHaveBeenCalledTimes(1);
    expect(saveVehicle.mock.calls[0][0].slug).toBe("open-car");
    expect(saveVehicle.mock.calls[0][1]).toEqual({
      tenantSlug: "unidades-chile",
    });
    expect(listImagesInFolder).not.toHaveBeenCalledWith("folder-locked");
  });
});
