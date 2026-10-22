import { describe, expect, it, vi } from "vitest";
import { assertDeletableVehiclePhotoBucket, isProtectedStoragePath } from "@/lib/server/photoObjectPath";
import { shouldReleaseRemovedVehicle } from "@/lib/server/googleSheetSyncService";
import {
  ORPHAN_MIN_AGE_MS,
  classifyListedStorage,
  deleteUnreferencedVehiclePhotos,
  orphanRow,
  releaseVehiclePhotos,
  runVehiclePhotoOrphanCleanup,
  selectOrphanPhotoPaths,
  vehicleStoragePrefixes,
} from "@/lib/server/vehiclePhotoGc";

const SUPABASE = "https://tuybpizjeszgwtcvunmp.supabase.co";

function photo(path: string): string {
  return `${SUPABASE}/storage/v1/object/public/vehicle-photos/${path}`;
}

describe("vehicle_photo_orphans", () => {
  it("arma la fila con el esquema de Unidades Chile", () => {
    const row = orphanRow({
      objectPath: "unidades-chile/hilux/abc.jpg",
      reason: "removed",
      error: "x".repeat(800),
    });
    expect(row).toMatchObject({
      bucket: "vehicle-photos",
      object_path: "unidades-chile/hilux/abc.jpg",
      tenant_slug: "unidades-chile",
      vehicle_slug: "hilux",
      reason: "removed",
      purged_at: null,
    });
    expect(row.public_url).toBe(photo("unidades-chile/hilux/abc.jpg"));
    expect(row.error).toHaveLength(500);
    expect(orphanRow({ objectPath: "unidades-chile/hilux/", reason: "sold" }).public_url).toBe("");
  });

  it("no borra un path que sigue citado y registra el fallo de Storage", async () => {
    const upsertOrphans = vi.fn(async () => undefined);
    const removeObjects = vi.fn(async () => {
      throw new Error("storage down");
    });
    const live = photo("rg-motors/yaris/live.jpg");
    const dead = photo("rg-motors/yaris/dead.jpg");
    const result = await deleteUnreferencedVehiclePhotos([live, dead], "replaced", {
      isReferenced: async (path) => path.endsWith("live.jpg"),
      removeObjects,
      upsertOrphans,
    });
    expect(result.deleted).toEqual([]);
    expect(result.kept).toContain("rg-motors/yaris/live.jpg");
    expect(removeObjects).toHaveBeenCalledTimes(1);
    expect(removeObjects).toHaveBeenCalledWith(["rg-motors/yaris/dead.jpg"]);
    expect(result.orphans).toEqual(["rg-motors/yaris/dead.jpg"]);
    expect(upsertOrphans).toHaveBeenCalledWith([
      expect.objectContaining({
        bucket: "vehicle-photos",
        object_path: "rg-motors/yaris/dead.jpg",
        tenant_slug: "rg-motors",
        vehicle_slug: "yaris",
        reason: "replaced",
        error: "storage down",
        purged_at: null,
      }),
    ]);
  });

  it("reintenta pendientes, lista un prefijo y no borra lo que volvió al catálogo", async () => {
    const removeObjects = vi.fn(async () => undefined);
    const listPrefix = vi.fn(async () => ["unidades-chile/sold/a.jpg"]);
    const markPurged = vi.fn(async () => undefined);
    const result = await runVehiclePhotoOrphanCleanup({
      deps: {
        loadPendingOrphans: async () => [
          orphanRow({ objectPath: "unidades-chile/sold/", reason: "sold", error: "list failed" }),
          orphanRow({ objectPath: "rg-motors/back/keep.jpg", reason: "deleted", error: "timeout" }),
        ],
        isReferenced: async (path) => path.endsWith("keep.jpg"),
        listPrefix,
        removeObjects,
        markPurged,
        listObjects: async () => [],
        loadReferencedPaths: async () => new Set<string>(),
        upsertOrphans: async () => undefined,
        now: () => Date.parse("2026-10-22T04:00:00.000Z"),
      },
    });
    expect(listPrefix).toHaveBeenCalledWith("unidades-chile/sold/");
    expect(removeObjects).toHaveBeenCalledWith(["unidades-chile/sold/a.jpg"]);
    expect(removeObjects).not.toHaveBeenCalledWith(["rg-motors/back/keep.jpg"]);
    expect(result.deleted).toEqual(["unidades-chile/sold/a.jpg"]);
    expect(markPurged).toHaveBeenCalledWith(["unidades-chile/sold/"]);
    expect(markPurged).toHaveBeenCalledWith(["rg-motors/back/keep.jpg"]);
  });

  it("en dryRun no escribe y salta objetos de menos de 15 minutos", async () => {
    const now = Date.parse("2026-10-22T04:00:00.000Z");
    const fresh = new Date(now - 60_000).toISOString();
    const old = new Date(now - ORPHAN_MIN_AGE_MS - 1000).toISOString();
    const referenced = new Set(["rg-motors/a/used.jpg"]);
    expect(
      selectOrphanPhotoPaths({
        now,
        referencedPaths: referenced,
        objects: [
          { name: "rg-motors/a/used.jpg", createdAt: old },
          { name: "rg-motors/a/fresh.jpg", createdAt: fresh },
          { name: "rg-motors/a/old.jpg", createdAt: old },
          { name: "rg-motors/a/unknown.jpg", createdAt: null },
        ],
      }),
    ).toEqual(["rg-motors/a/old.jpg"]);

    const removeObjects = vi.fn(async () => undefined);
    const upsertOrphans = vi.fn(async () => undefined);
    const dry = await runVehiclePhotoOrphanCleanup({
      dryRun: true,
      deps: {
        loadPendingOrphans: async () => [],
        listObjects: async () => [{ name: "rg-motors/a/old.jpg", createdAt: old }],
        loadReferencedPaths: async () => new Set<string>(),
        removeObjects,
        upsertOrphans,
        now: () => now,
      },
    });
    expect(dry.deleted).toEqual(["rg-motors/a/old.jpg"]);
    expect(removeObjects).not.toHaveBeenCalled();
    expect(upsertOrphans).not.toHaveBeenCalled();
  });

  it("cita tanto pattern como hiPattern del giro en Supabase", async () => {
    const seen: string[] = [];
    await releaseVehiclePhotos(
      {
        spin: {
          count: 2,
          pattern: photo("rg-motors/hilux/spin/v1/m900/{i}.webp"),
          hiPattern: photo("rg-motors/hilux/spin/v1/d1600/{i}.avif"),
        },
      },
      "sold",
      {
        isReferenced: async (path) => {
          seen.push(path);
          return true;
        },
        removeObjects: async () => undefined,
      },
    );
    expect(seen).toEqual([
      "rg-motors/hilux/spin/v1/m900/001.webp",
      "rg-motors/hilux/spin/v1/m900/002.webp",
      "rg-motors/hilux/spin/v1/d1600/001.avif",
      "rg-motors/hilux/spin/v1/d1600/002.avif",
    ]);
  });

  it("al soltar un auto también suelta los fotogramas de spin.hiPattern", async () => {
    const removeObjects = vi.fn(async () => undefined);
    const result = await releaseVehiclePhotos(
      {
        spin: {
          pattern: photo("rg-motors/hilux/spin/{index}.jpg"),
          hiPattern: photo("rg-motors/hilux/spin-hi/{index}.jpg"),
          count: 2,
        },
      },
      "deleted",
      { isReferenced: async () => false, removeObjects },
    );
    expect(result.deleted).toEqual([
      "rg-motors/hilux/spin/001.jpg",
      "rg-motors/hilux/spin/002.jpg",
      "rg-motors/hilux/spin-hi/001.jpg",
      "rg-motors/hilux/spin-hi/002.jpg",
    ]);
    expect(result.kept).toEqual([]);
  });

  it("en el mismo sync borra fotos y cada versión del 360, y no toca boletas ni pagos", async () => {
    const slug = "ford-edge-negro-2017-y55fqc";
    const spinFiles = [
      `rg-motors/${slug}/spin/v1/m900/001.webp`,
      `rg-motors/${slug}/spin/v1/d1600/001.webp`,
      `rg-motors/${slug}/spin/v1/d1600/002.webp`,
      `rg-motors/${slug}/spin/v2/m900/001.webp`,
      `boletas-receipts/2026/a.pdf`,
      `payments/2026/a.pdf`,
    ];
    const removeObjects = vi.fn(async () => undefined);
    const listPrefix = vi.fn(async (prefix: string) => {
      if (prefix === `rg-motors/${slug}`) return [`rg-motors/${slug}/cover.jpg`, ...spinFiles];
      if (prefix === `cars/spin/${slug}`) return [`cars/spin/${slug}/001.jpg`, `cars/spin/${slug}/manifest.json`];
      return [];
    });

    const result = await releaseVehiclePhotos(
      {
        slug,
        image: photo(`rg-motors/${slug}/cover.jpg`),
        gallery: [
          photo(`rg-motors/${slug}/cover.jpg`),
          `${SUPABASE}/storage/v1/object/public/boletas-receipts/2026/a.pdf`,
          `${SUPABASE}/storage/v1/object/public/payments/2026/a.pdf`,
        ],
        spin: {
          pattern: photo(`rg-motors/${slug}/spin/v1/m900/{i}.webp`),
          hiPattern: photo(`rg-motors/${slug}/spin/v1/d1600/{i}.webp`),
          count: 1,
        },
      },
      "sold",
      { isReferenced: async () => false, removeObjects, listPrefix },
    );

    expect(vehicleStoragePrefixes({ slug, image: photo(`rg-motors/${slug}/cover.jpg`) })).toEqual(
      expect.arrayContaining([`rg-motors/${slug}`, `cars/spin/${slug}`]),
    );
    expect(listPrefix).toHaveBeenCalledWith(`rg-motors/${slug}`);
    expect(listPrefix).toHaveBeenCalledWith(`cars/spin/${slug}`);
    expect(result.deleted).toEqual(expect.arrayContaining([
      `rg-motors/${slug}/cover.jpg`,
      `rg-motors/${slug}/spin/v1/m900/001.webp`,
      `rg-motors/${slug}/spin/v1/d1600/001.webp`,
      `rg-motors/${slug}/spin/v1/d1600/002.webp`,
      `rg-motors/${slug}/spin/v2/m900/001.webp`,
      `cars/spin/${slug}/001.jpg`,
      `cars/spin/${slug}/manifest.json`,
    ]));
    const touched = removeObjects.mock.calls.flat().flat() as string[];
    expect(touched.some((path) => /boletas|payments/i.test(path))).toBe(false);
    expect(result.deleted.some((path) => /boletas|payments/i.test(path))).toBe(false);
    expect(isProtectedStoragePath("boletas-receipts/2026/a.pdf")).toBe(true);
    expect(isProtectedStoragePath("payments/2026/a.pdf")).toBe(true);
  });

  it("al listar el giro trata m900 y d1600 como carpetas y descarta boletas", () => {
    const listed = classifyListedStorage("rg-motors/edge/spin/v1", [
      { name: "m900", id: null },
      { name: "d1600", id: null },
      { name: "manifest.json", id: "file-1" },
      { name: "boletas-receipts", id: null },
      { name: "payments", id: "file-2" },
    ]);
    expect(listed.folders).toEqual(["rg-motors/edge/spin/v1/m900", "rg-motors/edge/spin/v1/d1600"]);
    expect(listed.files).toEqual(["rg-motors/edge/spin/v1/manifest.json"]);
  });

  it("el sync suelta el auto que salió de la planilla de RG y conserva el resto", () => {
    expect(shouldReleaseRemovedVehicle({
      plateOnSheet: false,
      status: "Disponible",
      skipArchive: false,
      tenantSlug: "rg-motors",
    })).toBe(true);
    expect(shouldReleaseRemovedVehicle({
      plateOnSheet: true,
      status: "Disponible",
      skipArchive: false,
      tenantSlug: "rg-motors",
    })).toBe(false);
    expect(shouldReleaseRemovedVehicle({
      plateOnSheet: false,
      status: "Disponible",
      skipArchive: true,
      tenantSlug: "rg-motors",
    })).toBe(false);
    expect(shouldReleaseRemovedVehicle({
      plateOnSheet: false,
      status: "Borrador",
      skipArchive: false,
      tenantSlug: "rg-motors",
    })).toBe(false);
    expect(shouldReleaseRemovedVehicle({
      plateOnSheet: false,
      status: "Disponible",
      skipArchive: false,
      tenantSlug: "unidades-chile",
    })).toBe(false);
  });

  it("rechaza buckets que no son vehicle-photos", () => {
    for (const bucket of ["boletas-receipts", "app-releases", "vehicle-notes", "box-evidence"]) {
      expect(() => assertDeletableVehiclePhotoBucket(bucket)).toThrow(/protegido/i);
    }
    expect(() => assertDeletableVehiclePhotoBucket("otro")).toThrow(/vehicle-photos/);
  });
});
