import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/lib/vehicles";

const getVehicles = vi.hoisted(() => vi.fn());
const saveVehicle = vi.hoisted(() => vi.fn());
const storeMediaFile = vi.hoisted(() => vi.fn());
const downloadDriveFileBytes = vi.hoisted(() => vi.fn());
const downloadDriveRenderedJpeg = vi.hoisted(() => vi.fn());
const convertHeicToJpegBuffer = vi.hoisted(() => vi.fn());
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
  downloadDriveRenderedJpeg,
  getDrivePhotosFolderId: () => "root-folder",
  isGoogleDriveOAuthConfigured: () => true,
  listImagesInFolder,
  listPlateFolders,
}));

vi.mock("@/lib/server/convertHeic", () => ({
  isHeicFile: (name: string, mime?: string) =>
    /image\/(heic|heif)/i.test(String(mime || "")) || /\.(heic|heif)$/i.test(name),
  convertHeicToJpegBuffer,
}));

vi.mock("@/lib/server/db", () => ({
  readJson,
  writeJson,
}));

vi.mock("@/lib/server/verifyPhotos", () => ({
  blobStillExists,
}));

import { syncDrivePhotosViaOAuth } from "./driveOAuthSyncService";
import { folderContentHash } from "./drivePlateMatch";

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
    expect(readJson).toHaveBeenCalledWith(
      "drive-photos-sync-state.unidades-chile.json",
      expect.any(Object),
    );
  });
});

describe("syncDrivePhotosViaOAuth presupuesto e idempotencia", () => {
  const fresh = vehicle({
    slug: "fresh-car",
    plate: "AAAA 11",
    hasRealPhotos: false,
  });
  const second = vehicle({
    slug: "second-car",
    plate: "BBBB 22",
    hasRealPhotos: false,
  });
  const unchanged = vehicle({
    slug: "same-car",
    plate: "CCCC 33",
    hasRealPhotos: true,
    image: "https://blob.example/cars/uploads/same-car/file-same.jpg",
    gallery: ["https://blob.example/cars/uploads/same-car/file-same.jpg"],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    saveVehicle.mockResolvedValue({ success: true });
    writeJson.mockResolvedValue(undefined);
    blobStillExists.mockResolvedValue(true);
    downloadDriveFileBytes.mockResolvedValue(Buffer.from("img"));
    storeMediaFile.mockImplementation(
      async ({ relativePath }: { relativePath: string }) => ({
        url: `https://blob.example/${relativePath}`,
        relativePath: `/${relativePath}`,
        storage: "blob" as const,
      }),
    );
  });

  it("no lista ni baja una carpeta cuyo modifiedTime no cambió", async () => {
    getVehicles.mockResolvedValue([unchanged]);
    readJson.mockResolvedValue({
      lastRunAt: "2026-10-01T00:00:00.000Z",
      files: {
        "file-same": {
          modifiedTime: "2026-10-01T00:00:00.000Z",
          blobUrl: "https://blob.example/cars/uploads/same-car/file-same.jpg",
        },
      },
      folders: {
        "folder-same": {
          modifiedTime: "2026-10-02T00:00:00.000Z",
          contentHash: "abc",
        },
      },
    });
    listPlateFolders.mockResolvedValue([
      {
        id: "folder-same",
        name: "CCCC33",
        modifiedTime: "2026-10-02T00:00:00.000Z",
      },
    ]);

    const result = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });

    expect(result.success).toBe(true);
    expect(result.skippedUnchanged).toBe(1);
    expect(result.newPhotosDownloaded).toBe(0);
    expect(listImagesInFolder).not.toHaveBeenCalled();
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
  });

  it("salta la descarga si el hash de la carpeta no cambió", async () => {
    const images = [
      {
        id: "file-same",
        name: "1.jpg",
        mimeType: "image/jpeg",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ];
    getVehicles.mockResolvedValue([unchanged]);
    readJson.mockResolvedValue({
      lastRunAt: null,
      files: {
        "file-same": {
          modifiedTime: "2026-10-01T00:00:00.000Z",
          blobUrl: "https://blob.example/cars/uploads/same-car/file-same.jpg",
        },
      },
      folders: {
        "folder-same": { contentHash: folderContentHash(images) },
      },
    });
    listPlateFolders.mockResolvedValue([{ id: "folder-same", name: "CCCC33" }]);
    listImagesInFolder.mockResolvedValue(images);

    const result = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });

    expect(result.skippedUnchanged).toBe(1);
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
    expect(listImagesInFolder).toHaveBeenCalledTimes(1);
  });

  it("corta al presupuesto de fotos y deja el resto para la siguiente corrida", async () => {
    getVehicles.mockResolvedValue([fresh, second]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([
      { id: "folder-a", name: "AAAA11" },
      { id: "folder-b", name: "BBBB22" },
    ]);
    listImagesInFolder.mockImplementation(async (folderId: string) => [
      {
        id: folderId === "folder-a" ? "file-a" : "file-b",
        name: "1.jpg",
        mimeType: "image/jpeg",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);

    const result = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      maxNewPhotos: 1,
    });

    expect(result.newPhotosDownloaded).toBe(1);
    expect(result.syncedVehicles).toBe(1);
    expect(result.deferredVehicles).toBe(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledTimes(1);
    expect(saveVehicle).toHaveBeenCalledTimes(1);
    expect(saveVehicle.mock.calls[0][0].slug).toBe("fresh-car");
    expect(saveVehicle.mock.calls.some((call) => call[0]?.slug === "second-car")).toBe(
      false,
    );
  });

  it("sella una carpeta vacía y no la vuelve a listar si no cambia", async () => {
    getVehicles.mockResolvedValue([fresh]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([
      {
        id: "folder-a",
        name: "AAAA11",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);
    listImagesInFolder.mockResolvedValue([]);

    await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });
    const saved = writeJson.mock.calls.at(-1)?.[1] as {
      folders: Record<string, { contentHash?: string; modifiedTime?: string }>;
    };
    expect(saved.folders["folder-a"]).toMatchObject({
      contentHash: folderContentHash([]),
      modifiedTime: "2026-10-01T00:00:00.000Z",
    });

    readJson.mockResolvedValue(saved);
    listImagesInFolder.mockClear();
    const second = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });
    expect(listImagesInFolder).not.toHaveBeenCalled();
    expect(second.skippedUnchanged).toBe(1);
    expect(saveVehicle).not.toHaveBeenCalled();
  });

  it("guarda HEIC y DNG como el JPEG que ya renderizó Drive", async () => {
    const heicCar = vehicle({
      slug: "jrth",
      plate: "JRTH 26",
      hasRealPhotos: false,
    });
    getVehicles.mockResolvedValue([heicCar]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([{ id: "folder-jrth", name: "JRTH26" }]);
    listImagesInFolder.mockResolvedValue([
      {
        id: "heic-1",
        name: "IMG_0001.HEIC",
        mimeType: "image/heic",
        modifiedTime: "2026-10-01T00:00:00.000Z",
        thumbnailLink: "https://lh3.googleusercontent.com/d/heic-1=s220",
      },
      {
        id: "dng-1",
        name: "IMG_0002.DNG",
        mimeType: "image/x-adobe-dng",
        modifiedTime: "2026-10-01T00:00:00.000Z",
        thumbnailLink: "https://lh3.googleusercontent.com/d/dng-1=s220",
      },
    ]);
    downloadDriveRenderedJpeg.mockResolvedValue(Buffer.from("jpeg-render"));

    const result = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      photosPerVehicle: 6,
    });

    expect(result.newPhotosDownloaded).toBe(2);
    expect(result.syncedVehicles).toBe(1);
    expect(downloadDriveRenderedJpeg).toHaveBeenCalledWith(
      "heic-1",
      "https://lh3.googleusercontent.com/d/heic-1=s220",
    );
    expect(downloadDriveRenderedJpeg).toHaveBeenCalledWith(
      "dng-1",
      "https://lh3.googleusercontent.com/d/dng-1=s220",
    );
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();
    expect(saveVehicle.mock.calls[0][0].gallery).toEqual([
      "https://blob.example/cars/uploads/jrth/heic-1.jpg",
      "https://blob.example/cars/uploads/jrth/dng-1.jpg",
    ]);
  });

  it("si el thumbnail HEIC falla, convierte el original; un DNG sin thumbnail no se decodifica", async () => {
    const heicCar = vehicle({
      slug: "sgyl",
      plate: "SGYL 33",
      hasRealPhotos: false,
    });
    getVehicles.mockResolvedValue([heicCar]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([{ id: "folder-sgyl", name: "SGYL33" }]);
    listImagesInFolder.mockResolvedValue([
      {
        id: "heic-2",
        name: "solo.heic",
        mimeType: "image/heic",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);
    downloadDriveRenderedJpeg.mockRejectedValue(new Error("sin thumbnail"));
    downloadDriveFileBytes.mockResolvedValue(Buffer.from("heic-original"));
    convertHeicToJpegBuffer.mockResolvedValue({
      buffer: Buffer.from("jpeg-fallback"),
      contentType: "image/jpeg",
      ext: "jpg",
    });

    const heicResult = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });
    expect(heicResult.newPhotosDownloaded).toBe(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("heic-2");
    expect(convertHeicToJpegBuffer).toHaveBeenCalledTimes(1);
    expect(saveVehicle.mock.calls[0][0].image).toBe(
      "https://blob.example/cars/uploads/sgyl/heic-2.jpg",
    );

    const dngCar = vehicle({
      slug: "dng-car",
      plate: "DNGX 01",
      hasRealPhotos: false,
    });
    getVehicles.mockResolvedValue([dngCar]);
    listPlateFolders.mockResolvedValue([{ id: "folder-dng", name: "DNGX01" }]);
    listImagesInFolder.mockResolvedValue([
      {
        id: "dng-2",
        name: "raw.dng",
        mimeType: "image/x-adobe-dng",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);
    convertHeicToJpegBuffer.mockClear();
    downloadDriveFileBytes.mockClear();
    saveVehicle.mockClear();

    const dngResult = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });
    expect(dngResult.newPhotosDownloaded).toBe(0);
    expect(dngResult.errors?.length).toBeGreaterThan(0);
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
  });

  it("sigue con las fotos que pasaban del tope de 10 en la corrida siguiente", async () => {
    const car = vehicle({
      slug: "dwjs",
      plate: "DWJS 66",
      hasRealPhotos: false,
    });
    const images = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      name: `${i}.jpg`,
      mimeType: "image/jpeg",
      modifiedTime: "2026-10-01T00:00:00.000Z",
    }));
    getVehicles.mockResolvedValue([car]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([{ id: "folder-dwjs", name: "DWJS66" }]);
    listImagesInFolder.mockResolvedValue(images);

    const first = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      photosPerVehicle: 6,
      maxNewPhotos: 6,
    });
    expect(first.newPhotosDownloaded).toBe(6);
    expect(saveVehicle.mock.calls[0][0].gallery).toHaveLength(6);
    const saved = writeJson.mock.calls.at(-1)?.[1] as {
      files: Record<string, unknown>;
      folders: Record<string, unknown>;
    };
    expect(saved.folders["folder-dwjs"]).toBeUndefined();

    getVehicles.mockResolvedValue([
      {
        ...car,
        hasRealPhotos: true,
        image: saveVehicle.mock.calls[0][0].image,
        gallery: saveVehicle.mock.calls[0][0].gallery,
      },
    ]);
    readJson.mockResolvedValue(saved);
    downloadDriveFileBytes.mockClear();

    const second = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      photosPerVehicle: 6,
      maxNewPhotos: 6,
    });
    expect(second.newPhotosDownloaded).toBe(6);
    expect(saveVehicle.mock.calls.at(-1)?.[0].gallery).toHaveLength(12);
  });

  it("la corrida siguiente empieza por el auto sin fotos que todavía no tocó", async () => {
    const cars = ["AAAA 11", "BBBB 22", "CCCC 33"].map((plate, i) =>
      vehicle({ slug: `car-${i}`, plate, hasRealPhotos: false }),
    );
    getVehicles.mockResolvedValue(cars);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([
      { id: "fa", name: "AAAA11" },
      { id: "fb", name: "BBBB22" },
      { id: "fc", name: "CCCC33" },
    ]);
    listImagesInFolder.mockImplementation(async (folderId: string) => [
      {
        id: `file-${folderId}`,
        name: "1.jpg",
        mimeType: "image/jpeg",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);

    await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      maxNewPhotos: 1,
      photosPerVehicle: 1,
    });
    expect(downloadDriveFileBytes).toHaveBeenCalledTimes(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-fa");
    const saved = writeJson.mock.calls.at(-1)?.[1] as { zeroPhotoCursor?: string };
    expect(saved.zeroPhotoCursor).toBe("bbbb22");

    readJson.mockResolvedValue(saved);
    downloadDriveFileBytes.mockClear();
    await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      maxNewPhotos: 1,
      photosPerVehicle: 1,
    });
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-fb");
    expect(downloadDriveFileBytes).not.toHaveBeenCalledWith("file-fa");
  });

  it("no achica una galería ya guardada cuando el tope de la corrida es 6", async () => {
    const existing = Array.from(
      { length: 10 },
      (_, i) => `https://blob.example/cars/uploads/rzsy35/legacy-${i}.jpg`,
    );
    const car = vehicle({
      slug: "rzsy35",
      plate: "RZSY 35",
      hasRealPhotos: true,
      image: existing[0],
      gallery: existing,
    });
    getVehicles.mockResolvedValue([car]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([{ id: "folder-rzsy", name: "RZSY35" }]);
    listImagesInFolder.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `drv-${i}`,
        name: `${i}.jpg`,
        mimeType: "image/jpeg",
        modifiedTime: "2026-10-15T12:00:00.000Z",
      })),
    );

    const result = await syncDrivePhotosViaOAuth({
      tenantSlug: "unidades-chile",
      photosPerVehicle: 6,
      maxNewPhotos: 24,
    });

    expect(result.newPhotosDownloaded).toBe(6);
    expect(downloadDriveFileBytes).toHaveBeenCalledTimes(6);
    const saved = saveVehicle.mock.calls[0][0];
    expect(saved.gallery.length).toBeGreaterThanOrEqual(existing.length);
    for (const url of existing) {
      expect(saved.gallery).toContain(url);
    }
    expect(saved.image).toBe(existing[0]);
    const state = writeJson.mock.calls.at(-1)?.[1] as {
      folders: Record<string, unknown>;
    };
    expect(state.folders["folder-rzsy"]).toBeUndefined();
  });

  it("con el state del tenant vacío no vuelve a bajar fotos que ya están en la galería", async () => {
    const existing = Array.from(
      { length: 10 },
      (_, i) => `https://blob.example/cars/uploads/rzsy35/drv-${i}.jpg`,
    );
    const car = vehicle({
      slug: "rzsy35",
      plate: "RZSY 35",
      hasRealPhotos: true,
      image: existing[0],
      gallery: existing,
    });
    getVehicles.mockResolvedValue([car]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([{ id: "folder-rzsy", name: "RZSY35" }]);
    listImagesInFolder.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `drv-${i}`,
        name: `${i}.jpg`,
        mimeType: "image/jpeg",
        modifiedTime: "2026-10-15T12:00:00.000Z",
      })),
    );

    const result = await syncDrivePhotosViaOAuth({
      tenantSlug: "unidades-chile",
      photosPerVehicle: 6,
    });

    expect(result.newPhotosDownloaded).toBe(0);
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
    expect(result.skippedUnchanged).toBe(1);
  });

  it("no baja nada si el plazo de la corrida ya venció", async () => {
    getVehicles.mockResolvedValue([fresh]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([{ id: "folder-a", name: "AAAA11" }]);

    const result = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      deadlineAt: Date.now() - 1,
    });

    expect(result.deferredVehicles).toBeGreaterThan(0);
    expect(listImagesInFolder).not.toHaveBeenCalled();
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
  });
});
