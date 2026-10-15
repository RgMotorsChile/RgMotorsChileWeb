import { describe, expect, it } from "vitest";
import {
  buildPlateFolderIndex,
  driveFileNeedsSync,
  folderContentHash,
  folderMatchesVehiclePlate,
  folderStampIsCurrent,
  normalizePlateKey,
  pickBestPlateFolder,
  plateFolderNameVariants,
  plateFolderSearchPrefixes,
  prioritizeVehiclesForDriveSync,
  rotateSyncQueue,
} from "./drivePlateMatch";

describe("normalizePlateKey", () => {
  it("iguala PGBV10 y PGBV 10", () => {
    expect(normalizePlateKey("PGBV10")).toBe("pgbv10");
    expect(normalizePlateKey("PGBV 10")).toBe("pgbv10");
    expect(normalizePlateKey("pgbv-10")).toBe("pgbv10");
  });

  it("iguala RZVL18 y RZVL 18", () => {
    expect(normalizePlateKey("RZVL18")).toBe(normalizePlateKey("RZVL 18"));
  });
});

describe("plateFolderNameVariants", () => {
  it("pone primero el nombre junto (como en Drive)", () => {
    const v = plateFolderNameVariants("RZVL 18");
    expect(v[0]).toBe("RZVL18");
    expect(v).toContain("RZVL 18");
    expect(v).toContain("RZVL-18");
  });
});

describe("plateFolderSearchPrefixes", () => {
  it("incluye letras de la patente", () => {
    const p = plateFolderSearchPrefixes("RZVL 18");
    expect(p).toContain("RZVL18");
    expect(p).toContain("RZVL");
  });
});

describe("pickBestPlateFolder", () => {
  it("elige RZVL18 aunque también haya ruido", () => {
    const best = pickBestPlateFolder("RZVL 18", [
      { name: "RZVL180" },
      { name: "RZVL18" },
      { name: "RZVL 18 extra" },
    ]);
    expect(best?.name).toBe("RZVL18");
  });

  it("acepta carpeta con espacio si es la única", () => {
    const best = pickBestPlateFolder("RZVL18", [{ name: "RZVL 18" }]);
    expect(best?.name).toBe("RZVL 18");
  });
});

describe("folderMatchesVehiclePlate", () => {
  it("matchea carpeta sin espacios con patente con espacio", () => {
    expect(folderMatchesVehiclePlate("PGBV10", "PGBV 10")).toBe(true);
    expect(folderMatchesVehiclePlate("RZVL18", "RZVL 18")).toBe(true);
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

describe("rotateSyncQueue", () => {
  const cars = [
    { slug: "a", plate: "AAAA 11" },
    { slug: "b", plate: "BBBB 22" },
    { slug: "c", plate: "CCCC 33" },
  ];

  it("empieza por el cursor para no repetir siempre el primero", () => {
    expect(rotateSyncQueue(cars, "BBBB22").map((c) => c.slug)).toEqual(["b", "c", "a"]);
  });

  it("si el cursor ya no está en la cola, deja el orden", () => {
    expect(rotateSyncQueue(cars, "ZZZZ99").map((c) => c.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("prioriza autos sin fotos", () => {
  it("pone primero los que no tienen fotos reales", () => {
    const ordered = prioritizeVehiclesForDriveSync([
      { slug: "con-fotos", plate: "BBBB 22", hasRealPhotos: true },
      { slug: "sin-fotos", plate: "AAAA 11", hasRealPhotos: false },
    ]);
    expect(ordered.map((c) => c.slug)).toEqual(["sin-fotos", "con-fotos"]);
  });
});

describe("folderStampIsCurrent", () => {
  const images = [
    { id: "b", modifiedTime: "2026-02-01T00:00:00.000Z" },
    { id: "a", modifiedTime: "2026-01-01T00:00:00.000Z" },
  ];

  it("es estable aunque cambie el orden de las fotos", () => {
    expect(folderContentHash(images)).toBe(folderContentHash([...images].reverse()));
  });

  it("cambia si modifiedTime avanza", () => {
    const next = folderContentHash([
      { id: "a", modifiedTime: "2026-03-01T00:00:00.000Z" },
      images[0],
    ]);
    expect(next).not.toBe(folderContentHash(images));
  });

  it("salta la carpeta solo con sello y modifiedTime iguales", () => {
    const hash = folderContentHash(images);
    expect(
      folderStampIsCurrent(
        { modifiedTime: "2026-04-01T00:00:00.000Z" },
        { modifiedTime: "2026-04-01T00:00:00.000Z", contentHash: hash },
      ),
    ).toBe(true);
    expect(
      folderStampIsCurrent(
        { modifiedTime: "2026-05-01T00:00:00.000Z" },
        { modifiedTime: "2026-04-01T00:00:00.000Z", contentHash: hash },
      ),
    ).toBe(false);
    expect(folderStampIsCurrent({ modifiedTime: "2026-04-01T00:00:00.000Z" }, null)).toBe(
      false,
    );
  });
});

describe("buildPlateFolderIndex", () => {
  it("matchea RZVL 18 del stock con carpeta RZVL18", () => {
    const index = buildPlateFolderIndex([
      { id: "1", name: "RZVL18" },
      { id: "2", name: "PGBV10" },
    ]);
    expect(index.get(normalizePlateKey("RZVL 18"))?.name).toBe("RZVL18");
    expect(index.get("pgbv10")?.name).toBe("PGBV10");
  });
});
