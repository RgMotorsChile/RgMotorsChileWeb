import { describe, expect, it } from "vitest";
import {
  driveFileNeedsSync,
  folderMatchesVehiclePlate,
  normalizePlateKey,
  prioritizeVehiclesForDriveSync,
} from "./drivePlateMatch";

describe("normalizePlateKey", () => {
  it("iguala PGBV10 y PGBV 10", () => {
    expect(normalizePlateKey("PGBV10")).toBe("pgbv10");
    expect(normalizePlateKey("PGBV 10")).toBe("pgbv10");
    expect(normalizePlateKey("pgbv-10")).toBe("pgbv10");
  });
});

describe("folderMatchesVehiclePlate", () => {
  it("matchea carpeta sin espacios con patente con espacio", () => {
    expect(folderMatchesVehiclePlate("PGBV10", "PGBV 10")).toBe(true);
    expect(folderMatchesVehiclePlate("PGBV10", "RBFK 40")).toBe(false);
  });
});

describe("driveFileNeedsSync", () => {
  it("pide sync si no hay blob cacheado", () => {
    expect(
      driveFileNeedsSync(
        { id: "a", modifiedTime: "2026-01-01T00:00:00.000Z" },
        null,
      ),
    ).toBe(true);
  });

  it("no pide sync si modifiedTime no avanzó", () => {
    expect(
      driveFileNeedsSync(
        { id: "a", modifiedTime: "2026-01-01T00:00:00.000Z" },
        {
          blobUrl: "https://blob.example/a.jpg",
          modifiedTime: "2026-01-01T00:00:00.000Z",
        },
      ),
    ).toBe(false);
  });

  it("pide sync si el archivo de Drive es más nuevo", () => {
    expect(
      driveFileNeedsSync(
        { id: "a", modifiedTime: "2026-02-01T00:00:00.000Z" },
        {
          blobUrl: "https://blob.example/a.jpg",
          modifiedTime: "2026-01-01T00:00:00.000Z",
        },
      ),
    ).toBe(true);
  });
});

describe("prioritizeVehiclesForDriveSync", () => {
  it("pone primero los sin hasRealPhotos", () => {
    const ordered = prioritizeVehiclesForDriveSync([
      { slug: "b", hasRealPhotos: true },
      { slug: "a", hasRealPhotos: false },
      { slug: "c", hasRealPhotos: false },
    ]);
    expect(ordered.map((v) => v.slug)).toEqual(["a", "c", "b"]);
  });
});
