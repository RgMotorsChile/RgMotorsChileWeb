import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/lib/vehicles";

function hashedPhotoUrl(tenant: string, slug: string, bytes: string, ext = "jpg"): string {
  const hash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  return `https://blob.example/${tenant}/${slug}/${hash}.${ext}`;
}

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
import { DRIVE_FOLDER_STAMP_REVISION, folderContentHash } from "./drivePlateMatch";

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
    downloadDriveFileBytes.mockImplementation(async (id: string) => Buffer.from(`img:${id}`));
    storeMediaFile.mockImplementation(
      async ({ relativePath }: { relativePath: string }) => ({
        url: `https://blob.example/${relativePath}`,
        relativePath: `/${relativePath}`,
        storage: "blob" as const,
      }),
    );
  });

  it("agrega fotos al auto con portada bloqueada y no le cambia la portada", async () => {
    const result = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });

    expect(result.success).toBe(true);
    expect(result.syncedVehicles).toBe(2);
    expect(result.newPhotosDownloaded).toBe(2);
    expect(listImagesInFolder).toHaveBeenCalledWith("folder-locked");
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-locked");

    const lockedSave = saveVehicle.mock.calls.find((call) => call[0]?.slug === "locked-car")?.[0];
    expect(lockedSave.image).toBe("https://cdn.example/locked-cover.jpg");
    expect(lockedSave.gallery).toContain("https://cdn.example/locked-cover.jpg");
    expect(lockedSave.gallery).toContain(
      hashedPhotoUrl("rg-motors", "locked-car", "img:file-locked"),
    );
    expect(lockedSave.coverLocked).toBe(true);

    const openSave = saveVehicle.mock.calls.find((call) => call[0]?.slug === "open-car");
    expect(openSave?.[0].image).toBe(
      hashedPhotoUrl("rg-motors", "open-car", "img:file-open"),
    );
    expect(openSave?.[1]).toEqual({ tenantSlug: "rg-motors" });
  });

  it("en Unidades Chile también conserva la portada bloqueada al sumar fotos", async () => {
    await syncDrivePhotosViaOAuth({ tenantSlug: "unidades-chile" });

    expect(getVehicles).toHaveBeenCalledWith({
      tenantSlug: "unidades-chile",
      bypassCache: true,
      scope: "staff",
    });
    const lockedSave = saveVehicle.mock.calls.find((call) => call[0]?.slug === "locked-car")?.[0];
    expect(lockedSave.image).toBe("https://cdn.example/locked-cover.jpg");
    expect(lockedSave.gallery).toContain(
      hashedPhotoUrl("unidades-chile", "locked-car", "img:file-locked"),
    );
    expect(saveVehicle.mock.calls[0][1]).toEqual({
      tenantSlug: "unidades-chile",
    });
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
    downloadDriveFileBytes.mockImplementation(async (id: string) => Buffer.from(`img:${id}`));
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
          revision: DRIVE_FOLDER_STAMP_REVISION,
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
    downloadDriveRenderedJpeg.mockImplementation(async (id: string) => Buffer.from(`jpeg:${id}`));

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
      hashedPhotoUrl("rg-motors", "jrth", "jpeg:heic-1"),
      hashedPhotoUrl("rg-motors", "jrth", "jpeg:dng-1"),
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
      hashedPhotoUrl("rg-motors", "sgyl", "jpeg-fallback"),
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

  it("migrateBlobUrls reemplaza la URL de Vercel Blob sin HEAD y no la vuelve a bajar", async () => {
    const legacy =
      "https://old.public.blob.vercel-storage.com/cars/uploads/fresh-car/file-a.jpg";
    const car = vehicle({
      slug: "fresh-car",
      plate: "AAAA 11",
      hasRealPhotos: true,
      image: legacy,
      gallery: [legacy],
    });
    getVehicles.mockResolvedValue([car]);
    readJson.mockResolvedValue({
      lastRunAt: null,
      files: {
        "file-a": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: legacy },
      },
      folders: {},
    });
    listPlateFolders.mockResolvedValue([{ id: "folder-a", name: "AAAA11" }]);
    listImagesInFolder.mockResolvedValue([
      {
        id: "file-a",
        name: "1.jpg",
        mimeType: "image/jpeg",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);

    const first = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      migrateBlobUrls: true,
      maxBlobHeadChecks: 0,
    });
    const nextUrl = hashedPhotoUrl("rg-motors", "fresh-car", "img:file-a");
    expect(blobStillExists).not.toHaveBeenCalled();
    expect(first.newPhotosDownloaded).toBe(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-a");
    expect(saveVehicle.mock.calls[0][0].image).toBe(nextUrl);
    expect(saveVehicle.mock.calls[0][0].gallery).not.toContain(legacy);

    const state = writeJson.mock.calls.at(-1)?.[1];
    readJson.mockResolvedValue(state);
    getVehicles.mockResolvedValue([
      { ...car, image: nextUrl, gallery: [nextUrl], hasRealPhotos: true },
    ]);
    downloadDriveFileBytes.mockClear();
    blobStillExists.mockClear();
    const second = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      migrateBlobUrls: true,
      maxBlobHeadChecks: 0,
    });
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(blobStillExists).not.toHaveBeenCalled();
    expect(second.newPhotosDownloaded).toBe(0);
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

  it("fusiona las dos carpetas de la patente y no usa SRCP17 para otra patente", async () => {
    const car = vehicle({
      slug: "pskj",
      plate: "PSKJ 78",
      hasRealPhotos: false,
    });
    getVehicles.mockResolvedValue([car]);
    readJson.mockResolvedValue({ lastRunAt: null, files: {}, folders: {} });
    listPlateFolders.mockResolvedValue([
      { id: "folder-a", name: "PSKJ78" },
      { id: "folder-b", name: "PSKJ 78" },
      { id: "folder-typo", name: "SRCP17" },
    ]);
    listImagesInFolder.mockImplementation(async (folderId: string) => {
      if (folderId === "folder-a") {
        return [
          {
            id: "a1",
            name: "1.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-10-01T00:00:00.000Z",
          },
        ];
      }
      if (folderId === "folder-b") {
        return [
          {
            id: "b1",
            name: "1.jpg",
            mimeType: "image/jpeg",
            modifiedTime: "2026-10-01T00:00:00.000Z",
          },
        ];
      }
      return [
        {
          id: "typo",
          name: "1.jpg",
          mimeType: "image/jpeg",
          modifiedTime: "2026-10-01T00:00:00.000Z",
        },
      ];
    });

    const result = await syncDrivePhotosViaOAuth({
      tenantSlug: "rg-motors",
      photosPerVehicle: 12,
      maxNewPhotos: 36,
    });

    expect(result.newPhotosDownloaded).toBe(2);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("a1");
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("b1");
    expect(downloadDriveFileBytes).not.toHaveBeenCalledWith("typo");
    expect(saveVehicle.mock.calls[0][0].gallery).toEqual([
      hashedPhotoUrl("rg-motors", "pskj", "img:a1"),
      hashedPhotoUrl("rg-motors", "pskj", "img:b1"),
    ]);
  });

  it("un sello viejo sin revisión vuelve a listar la carpeta", async () => {
    getVehicles.mockResolvedValue([unchanged]);
    readJson.mockResolvedValue({
      lastRunAt: "2026-10-01T00:00:00.000Z",
      files: {},
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
    listImagesInFolder.mockResolvedValue([
      {
        id: "file-new",
        name: "2.jpg",
        mimeType: "image/jpeg",
        modifiedTime: "2026-10-01T00:00:00.000Z",
      },
    ]);

    await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });
    expect(listImagesInFolder).toHaveBeenCalledWith("folder-same");
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
    expect(blobStillExists).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
  });
});

function driveImage(id: string) {
  return {
    id,
    name: `${id}.jpg`,
    mimeType: "image/jpeg",
    modifiedTime: "2026-10-01T00:00:00.000Z",
  };
}

function sealedFolderState(
  folderId: string,
  images: Array<{ id: string; modifiedTime?: string }>,
  files: Record<string, { modifiedTime?: string; blobUrl?: string }>,
) {
  return {
    lastRunAt: "2026-10-02T00:00:00.000Z",
    files,
    folders: {
      [folderId]: {
        modifiedTime: "2026-10-02T00:00:00.000Z",
        contentHash: folderContentHash(images),
        revision: DRIVE_FOLDER_STAMP_REVISION,
      },
    },
  };
}

describe("syncDrivePhotosViaOAuth blobs 404", () => {
  const front =
    "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-front.jpg";
  const side =
    "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-side.jpg";
  const rear =
    "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-rear.jpg";
  const orphan =
    "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-gone.jpg";
  const ssddImages = [driveImage("file-front"), driveImage("file-side"), driveImage("file-rear")];

  beforeEach(() => {
    vi.clearAllMocks();
    saveVehicle.mockResolvedValue({ success: true });
    writeJson.mockResolvedValue(undefined);
    downloadDriveFileBytes.mockImplementation(async (id: string) => Buffer.from(`img:${id}`));
    storeMediaFile.mockImplementation(async ({ relativePath }: { relativePath: string }) => ({
      url: `https://blob.example/${relativePath}`,
      relativePath: `/${relativePath}`,
      storage: "blob" as const,
    }));
  });

  it("re-sube el blob 404 de una carpeta sellada, conserva orden, portada y filas válidas", async () => {
    const ssdd = vehicle({
      slug: "ssdd57",
      plate: "SSDD57",
      hasRealPhotos: true,
      image: front,
      gallery: [front, side, rear, orphan],
    });
    const healthyUrl = "https://old.public.blob.vercel-storage.com/cars/uploads/ok-car/file-ok.jpg";
    const healthy = vehicle({
      slug: "ok-car",
      plate: "OKOK11",
      hasRealPhotos: true,
      image: healthyUrl,
      gallery: [healthyUrl],
    });
    const healthyImages = [driveImage("file-ok")];
    getVehicles.mockResolvedValue([ssdd, healthy]);
    readJson.mockResolvedValue({
      ...sealedFolderState("folder-ssdd", ssddImages, {
        "file-front": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: front },
        "file-side": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: side },
        "file-rear": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: rear },
      }),
      folders: {
        "folder-ssdd": sealedFolderState("folder-ssdd", ssddImages, {}).folders["folder-ssdd"],
        "folder-ok": sealedFolderState("folder-ok", healthyImages, {}).folders["folder-ok"],
      },
      files: {
        "file-front": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: front },
        "file-side": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: side },
        "file-rear": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: rear },
        "file-ok": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: healthyUrl },
      },
    });
    listPlateFolders.mockResolvedValue([
      { id: "folder-ssdd", name: "SSDD57", modifiedTime: "2026-10-02T00:00:00.000Z" },
      { id: "folder-ok", name: "OKOK11", modifiedTime: "2026-10-02T00:00:00.000Z" },
    ]);
    listImagesInFolder.mockImplementation(async (folderId: string) => {
      if (folderId === "folder-ssdd") return ssddImages;
      if (folderId === "folder-ok") return healthyImages;
      return [];
    });
    blobStillExists.mockImplementation(async (url: string) => url !== side && url !== orphan);

    const result = await syncDrivePhotosViaOAuth({ tenantSlug: "unidades-chile" });

    expect(result.success).toBe(true);
    expect(result.repairedPhotos).toBe(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledTimes(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-side");
    expect(listImagesInFolder).toHaveBeenCalledWith("folder-ssdd");
    expect(listImagesInFolder).not.toHaveBeenCalledWith("folder-ok");
    const saved = saveVehicle.mock.calls[0][0];
    expect(saved.image).toBe(front);
    expect(saved.gallery).toEqual([
      front,
      hashedPhotoUrl("unidades-chile", "ssdd57", "img:file-side"),
      rear,
      orphan,
    ]);
    expect(saveVehicle.mock.calls[0][1]).toEqual({ tenantSlug: "unidades-chile" });
  });

  it("con portada bloqueada re-sube esa misma foto si el blob de la portada es 404", async () => {
    const cover =
      "https://old.public.blob.vercel-storage.com/cars/uploads/sxdw38/file-cover.jpg";
    const other =
      "https://old.public.blob.vercel-storage.com/cars/uploads/sxdw38/file-other.jpg";
    const images = [driveImage("file-cover"), driveImage("file-other")];
    const sxdw = vehicle({
      slug: "sxdw38",
      plate: "SXDW38",
      hasRealPhotos: true,
      coverLocked: true,
      image: cover,
      gallery: [cover, other],
    });
    getVehicles.mockResolvedValue([sxdw]);
    readJson.mockResolvedValue(
      sealedFolderState("folder-sxdw", images, {
        "file-cover": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: cover },
        "file-other": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: other },
      }),
    );
    listPlateFolders.mockResolvedValue([
      { id: "folder-sxdw", name: "SXDW38", modifiedTime: "2026-10-02T00:00:00.000Z" },
    ]);
    listImagesInFolder.mockResolvedValue(images);
    blobStillExists.mockImplementation(async (url: string) => url !== cover);

    const result = await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });

    expect(result.repairedPhotos).toBe(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledTimes(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-cover");
    const saved = saveVehicle.mock.calls[0][0];
    const fresh = hashedPhotoUrl("rg-motors", "sxdw38", "img:file-cover");
    expect(saved.coverLocked).toBe(true);
    expect(saved.image).toBe(fresh);
    expect(saved.gallery).toEqual([fresh, other]);
  });

  it("con portada bloqueada no cambia la portada si el 404 es otra foto", async () => {
    const cover =
      "https://old.public.blob.vercel-storage.com/cars/uploads/sxdw38/file-cover.jpg";
    const other =
      "https://old.public.blob.vercel-storage.com/cars/uploads/sxdw38/file-other.jpg";
    const images = [driveImage("file-cover"), driveImage("file-other")];
    const sxdw = vehicle({
      slug: "sxdw38",
      plate: "SXDW38",
      hasRealPhotos: true,
      coverLocked: true,
      image: cover,
      gallery: [other, cover],
    });
    getVehicles.mockResolvedValue([sxdw]);
    readJson.mockResolvedValue(
      sealedFolderState("folder-sxdw", images, {
        "file-cover": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: cover },
        "file-other": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: other },
      }),
    );
    listPlateFolders.mockResolvedValue([
      { id: "folder-sxdw", name: "SXDW38", modifiedTime: "2026-10-02T00:00:00.000Z" },
    ]);
    listImagesInFolder.mockResolvedValue(images);
    blobStillExists.mockImplementation(async (url: string) => url !== other);

    await syncDrivePhotosViaOAuth({ tenantSlug: "unidades-chile" });

    expect(downloadDriveFileBytes).toHaveBeenCalledTimes(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-other");
    const saved = saveVehicle.mock.calls[0][0];
    expect(saved.coverLocked).toBe(true);
    expect(saved.image).toBe(cover);
    expect(saved.gallery).toEqual([
      hashedPhotoUrl("unidades-chile", "sxdw38", "img:file-other"),
      cover,
    ]);
  });

  it("no borra la fila si el blob es 404 y el archivo ya no está en Drive", async () => {
    const only =
      "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-gone.jpg";
    const images = [driveImage("file-front")];
    const ssdd = vehicle({
      slug: "ssdd57",
      plate: "SSDD57",
      hasRealPhotos: true,
      image: only,
      gallery: [only],
    });
    getVehicles.mockResolvedValue([ssdd]);
    readJson.mockResolvedValue(
      sealedFolderState("folder-ssdd", images, {
        "file-front": {
          modifiedTime: "2026-10-01T00:00:00.000Z",
          blobUrl: "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-front.jpg",
        },
      }),
    );
    listPlateFolders.mockResolvedValue([
      { id: "folder-ssdd", name: "SSDD57", modifiedTime: "2026-10-02T00:00:00.000Z" },
    ]);
    listImagesInFolder.mockResolvedValue(images);
    blobStillExists.mockResolvedValue(false);

    const result = await syncDrivePhotosViaOAuth({ tenantSlug: "unidades-chile" });

    expect(result.repairedPhotos).toBe(0);
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
  });

  it("respeta el cupo de HEAD y sigue en la misma patente en la corrida siguiente", async () => {
    const first =
      "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-a.jpg";
    const second =
      "https://old.public.blob.vercel-storage.com/cars/uploads/ssdd57/file-b.jpg";
    const images = [driveImage("file-a"), driveImage("file-b")];
    const ssdd = vehicle({
      slug: "ssdd57",
      plate: "SSDD57",
      hasRealPhotos: true,
      image: first,
      gallery: [first, second],
    });
    getVehicles.mockResolvedValue([ssdd]);
    readJson.mockResolvedValue(
      sealedFolderState("folder-ssdd", images, {
        "file-a": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: first },
        "file-b": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: second },
      }),
    );
    listPlateFolders.mockResolvedValue([
      { id: "folder-ssdd", name: "SSDD57", modifiedTime: "2026-10-02T00:00:00.000Z" },
    ]);
    listImagesInFolder.mockResolvedValue(images);
    blobStillExists.mockImplementation(async (url: string) => url !== second);

    const firstRun = await syncDrivePhotosViaOAuth({
      tenantSlug: "unidades-chile",
      maxBlobHeadChecks: 1,
    });

    expect(firstRun.repairedPhotos).toBe(0);
    expect(blobStillExists).toHaveBeenCalledTimes(1);
    expect(blobStillExists).toHaveBeenCalledWith(first);
    expect(downloadDriveFileBytes).not.toHaveBeenCalled();
    expect(saveVehicle).not.toHaveBeenCalled();
    const saved = writeJson.mock.calls.at(-1)?.[1] as {
      blobCheckCursor?: string;
      blobCheckOffset?: number;
    };
    expect(saved.blobCheckCursor).toBe("ssdd57");
    expect(saved.blobCheckOffset).toBe(1);

    readJson.mockResolvedValue(saved);
    blobStillExists.mockClear();
    const secondRun = await syncDrivePhotosViaOAuth({
      tenantSlug: "unidades-chile",
      maxBlobHeadChecks: 1,
    });

    expect(secondRun.repairedPhotos).toBe(1);
    expect(blobStillExists).toHaveBeenCalledTimes(1);
    expect(blobStillExists).toHaveBeenCalledWith(second);
    expect(downloadDriveFileBytes).toHaveBeenCalledTimes(1);
    expect(downloadDriveFileBytes).toHaveBeenCalledWith("file-b");
    const repaired = saveVehicle.mock.calls[0][0];
    expect(repaired.image).toBe(first);
    expect(repaired.gallery).toEqual([
      first,
      hashedPhotoUrl("unidades-chile", "ssdd57", "img:file-b"),
    ]);
  });

  it("saca de la galería un archivo de Drive que ya no está en un listado completo", async () => {
    const keep = "https://cdn.example/keep.jpg";
    const gone = "https://blob.example/rg-motors/drop-car/old.jpg";
    const car = vehicle({
      slug: "drop-car",
      plate: "DROP11",
      hasRealPhotos: true,
      image: keep,
      gallery: [keep, gone],
    });
    getVehicles.mockResolvedValue([car]);
    readJson.mockResolvedValue({
      lastRunAt: null,
      files: {
        "file-keep": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: keep },
        "file-gone": { modifiedTime: "2026-10-01T00:00:00.000Z", blobUrl: gone },
      },
      folders: {},
    });
    listPlateFolders.mockResolvedValue([{ id: "folder-drop", name: "DROP11" }]);
    listImagesInFolder.mockResolvedValue([driveImage("file-keep")]);
    blobStillExists.mockResolvedValue(true);

    await syncDrivePhotosViaOAuth({ tenantSlug: "rg-motors" });

    const saved = saveVehicle.mock.calls[0][0];
    expect(saved.gallery).toContain(keep);
    expect(saved.gallery).not.toContain(gone);
  });
});
