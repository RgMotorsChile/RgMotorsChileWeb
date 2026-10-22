import { describe, expect, it, vi } from "vitest";
import type { Vehicle } from "@/lib/vehicles";
import {
  abortSpinUpload,
  commitSpinUpload,
  createSpinUploadUrls,
  legacySpinPrefix,
  parseSpinUploadBody,
  spinFrameObjectPath,
  spinSetPrefix,
} from "@/lib/server/spinUpload";

const SUPABASE = "https://tuybpizjeszgwtcvunmp.supabase.co";
const SLUG = "hilux-2020";
const VERSION = "ab12cd34";

function photo(path: string): string {
  return `${SUPABASE}/storage/v1/object/public/vehicle-photos/${path}`;
}

function frames(ext: string, count = 24) {
  return Array.from({ length: count }, (_, index) => ({
    name: `${String(index + 1).padStart(3, "0")}.${ext}`,
    folder: false,
  }));
}

function vehicle(): Vehicle {
  return {
    slug: SLUG,
    brand: "Toyota",
    model: "Hilux",
    version: "DX",
    year: 2020,
    price: 1,
    km: 1,
    fuel: "Diésel",
    transmission: "Manual",
    bodyType: "Camioneta",
    location: "Puerto Montt",
    image: photo("rg-motors/hilux-2020/cover.jpg"),
    engine: "2.4",
    power: "150 HP",
    traction: "4x4",
    doors: 4,
    spin: {
      count: 24,
      front: 4,
      pattern: photo("rg-motors/hilux-2020/spin/oldver/m900/{i}.webp"),
      hiPattern: photo("rg-motors/hilux-2020/spin/oldver/d1600/{i}.avif"),
    },
  };
}

function body(sets: Array<{ name: string; ext: string; count: number }>, slug = SLUG) {
  return { slug, version: VERSION, sets };
}

describe("rutas firmadas del giro", () => {
  it("rechaza slug, set, extensión y cantidad antes de firmar", async () => {
    const sign = vi.fn();
    const deps = { findVehicle: async () => vehicle(), createSignedUploadUrl: sign };

    expect(parseSpinUploadBody({ slug: "../etc", version: VERSION, sets: [{ name: "m900", ext: "webp", count: 24 }] }).ok).toBe(false);
    expect(parseSpinUploadBody(body([{ name: "full", ext: "jpg", count: 10 }])).ok).toBe(false);
    expect(parseSpinUploadBody(body([{ name: "m900", ext: "jpg", count: 24 }])).ok).toBe(false);
    expect(parseSpinUploadBody(body([{ name: "m900", ext: "webp", count: 23 }])).ok).toBe(false);
    expect(parseSpinUploadBody(body([{ name: "m900", ext: "webp", count: 201 }])).ok).toBe(false);
    expect(parseSpinUploadBody({ slug: SLUG, version: "a/b", sets: [{ name: "m900", ext: "webp", count: 24 }] }).ok).toBe(false);
    expect(parseSpinUploadBody(body([{ name: "m900", ext: "webp", count: 200 }])).ok).toBe(true);

    const missing = await createSpinUploadUrls(body([{ name: "m900", ext: "webp", count: 24 }], "no-existe"), {
      ...deps,
      findVehicle: async () => null,
    });
    expect(missing.status).toBe(404);

    const bad = await createSpinUploadUrls(
      { slug: "Hilux-2020", version: "../v", sets: [{ name: "m900", ext: "webp", count: 24 }] },
      deps,
    );
    expect(bad.status).toBe(400);
    expect(sign).not.toHaveBeenCalled();
  });

  it("firma vehicle-photos con el slug, el set y el prefijo del giro", async () => {
    const signed: string[] = [];
    const result = await createSpinUploadUrls(
      {
        slug: "Hilux-2020",
        version: VERSION,
        sets: [
          { name: "m900", ext: "webp", count: 24 },
          { name: "d1600", ext: "avif", count: 24 },
        ],
      },
      {
        findVehicle: async (slug) => (slug === SLUG ? vehicle() : null),
        createSignedUploadUrl: async (path) => {
          signed.push(path);
          return { signedUrl: `https://sign.test/${path}`, token: "tok", path };
        },
      },
    );

    expect(result.status).toBe(200);
    expect(result.body.bucket).toBe("vehicle-photos");
    const m900 = spinSetPrefix({ tenant: "rg-motors", slug: SLUG, version: VERSION, set: "m900" });
    const d1600 = spinSetPrefix({ tenant: "rg-motors", slug: SLUG, version: VERSION, set: "d1600" });
    expect(m900).toBe(`rg-motors/${SLUG}/spin/${VERSION}/m900`);
    expect(signed[0]).toBe(spinFrameObjectPath({
      tenant: "rg-motors",
      slug: SLUG,
      version: VERSION,
      set: "m900",
      index: 1,
      ext: "webp",
    }));
    expect(signed[23]).toBe(`${m900}/024.webp`);
    expect(signed[24]).toBe(`${d1600}/001.avif`);
    expect(signed.filter((path) => path.includes("/m900/")).every((path) => path.startsWith(`${m900}/`))).toBe(true);
    expect(signed.filter((path) => path.includes("/d1600/")).every((path) => path.startsWith(`${d1600}/`))).toBe(true);
    expect(signed.some((path) => path.startsWith("cars/spin/") || path.includes(".."))).toBe(false);
    expect(signed.every((path) => /^rg-motors\/hilux-2020\/spin\/ab12cd34\/(m900|d1600)\/\d{3}\.(webp|avif)$/.test(path))).toBe(true);
  });

  it("no firma 142 fotogramas de una vez y sí firma el rango pedido", async () => {
    const sign = vi.fn(async (path: string) => ({ signedUrl: `https://sign.test/${path}`, token: "tok", path }));
    const huge = await createSpinUploadUrls(body([{ name: "m900", ext: "webp", count: 142 }]), {
      findVehicle: async () => vehicle(),
      createSignedUploadUrl: sign,
    });
    expect(huge.status).toBe(400);
    expect(String(huge.body.error)).toMatch(/lotes/);
    expect(sign).not.toHaveBeenCalled();

    const signed: string[] = [];
    const slice = await createSpinUploadUrls(
      {
        slug: SLUG,
        version: VERSION,
        sets: [{ name: "m900", ext: "webp", count: 142, from: 3, to: 5 }],
      },
      {
        findVehicle: async () => vehicle(),
        createSignedUploadUrl: async (path) => {
          signed.push(path);
          return { signedUrl: `https://sign.test/${path}`, token: "tok", path };
        },
      },
    );
    expect(slice.status).toBe(200);
    expect(signed).toEqual([3, 4, 5].map((index) =>
      spinFrameObjectPath({
        tenant: "rg-motors",
        slug: SLUG,
        version: VERSION,
        set: "m900",
        index,
        ext: "webp",
      }),
    ));
  });
});

describe("commit del giro", () => {
  it("responde 409 y no toca la base si falta un fotograma", async () => {
    const save = vi.fn();
    const remove = vi.fn();
    const drop = vi.fn();
    const names = frames("webp");
    names.pop();
    const result = await commitSpinUpload(body([{ name: "m900", ext: "webp", count: 24 }]), {
      supabaseUrl: SUPABASE,
      findVehicle: async () => vehicle(),
      listFolder: async () => names,
      saveVehicle: save,
      deleteUnreferenced: drop,
      removeLocalSpin: remove,
    });
    expect(result.status).toBe(409);
    expect(result.body.missing).toContain(
      `rg-motors/${SLUG}/spin/${VERSION}/m900/024.webp`,
    );
    expect(save).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("guarda pattern y hiPattern y borra la versión anterior y cars/spin", async () => {
    const save = vi.fn(async (next: Vehicle) => ({ success: true, vehicle: next }));
    const remove = vi.fn(async () => undefined);
    const dropped: string[][] = [];
    const result = await commitSpinUpload(
      body([
        { name: "m900", ext: "webp", count: 24 },
        { name: "d1600", ext: "avif", count: 24 },
      ]),
      {
        supabaseUrl: SUPABASE,
        findVehicle: async () => vehicle(),
        listFolder: async (prefix) => {
          if (prefix.endsWith("/m900") && prefix.includes(`/${VERSION}/`)) return frames("webp");
          if (prefix.endsWith("/d1600") && prefix.includes(`/${VERSION}/`)) return frames("avif");
          if (prefix === `rg-motors/${SLUG}/spin/oldver`) {
            return [
              { name: "m900", folder: true },
              { name: "d1600", folder: true },
            ];
          }
          if (prefix === `rg-motors/${SLUG}/spin/oldver/m900`) return [{ name: "001.webp", folder: false }];
          if (prefix === `rg-motors/${SLUG}/spin/oldver/d1600`) return [{ name: "001.avif", folder: false }];
          if (prefix === legacySpinPrefix(SLUG)) {
            return [
              { name: "001.jpg", folder: false },
              { name: "manifest.json", folder: false },
            ];
          }
          return [];
        },
        saveVehicle: save,
        deleteUnreferenced: async (urls) => {
          dropped.push(urls);
          return { deleted: [], kept: [], orphans: [] };
        },
        removeLocalSpin: remove,
      },
    );

    expect(result.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].spin).toEqual({
      count: 24,
      front: 0,
      pattern: photo(`rg-motors/${SLUG}/spin/${VERSION}/m900/{i}.webp`),
      hiPattern: photo(`rg-motors/${SLUG}/spin/${VERSION}/d1600/{i}.avif`),
    });
    const urls = dropped[0] ?? [];
    expect(urls).toContain(photo(`rg-motors/${SLUG}/spin/oldver/m900/001.webp`));
    expect(urls).toContain(photo(`rg-motors/${SLUG}/spin/oldver/d1600/001.avif`));
    expect(urls).toContain(photo(`${legacySpinPrefix(SLUG)}/001.jpg`));
    expect(urls).toContain(photo(`${legacySpinPrefix(SLUG)}/manifest.json`));
    expect(remove).toHaveBeenCalledWith(SLUG);
  });

  it("no borra nada si guardar el vehículo falla", async () => {
    const drop = vi.fn();
    const remove = vi.fn();
    const result = await commitSpinUpload(body([{ name: "m900", ext: "webp", count: 24 }]), {
      supabaseUrl: SUPABASE,
      findVehicle: async () => vehicle(),
      listFolder: async () => frames("webp"),
      saveVehicle: async () => ({ success: false, error: "db" }),
      deleteUnreferenced: drop,
      removeLocalSpin: remove,
    });
    expect(result.status).toBe(500);
    expect(drop).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("abort del giro", () => {
  it("no borra la versión publicada ni toca la base", async () => {
    const remove = vi.fn();
    const published = vehicle();
    published.spin = {
      count: 142,
      front: 0,
      pattern: photo(`rg-motors/${SLUG}/spin/mvjnpp9vui5jn5/m900/{i}.webp`),
    };
    const result = await abortSpinUpload(
      { slug: SLUG, version: "mvjnpp9vui5jn5" },
      {
        findVehicle: async () => published,
        listFolder: async () => [{ name: "001.webp", folder: false }],
        removeObjects: remove,
      },
    );
    expect(result.status).toBe(409);
    expect(String(result.body.error)).toMatch(/publicada/);
    expect(remove).not.toHaveBeenCalled();
  });

  it("borra solo los archivos de la versión que falló", async () => {
    const removed: string[][] = [];
    const result = await abortSpinUpload(
      { slug: SLUG, version: "intento2" },
      {
        findVehicle: async () => vehicle(),
        listFolder: async (prefix) => {
          if (prefix === `rg-motors/${SLUG}/spin/intento2`) return [{ name: "m900", folder: true }];
          if (prefix === `rg-motors/${SLUG}/spin/intento2/m900`) {
            return [
              { name: "001.webp", folder: false },
              { name: "002.webp", folder: false },
            ];
          }
          return [{ name: "001.webp", folder: false }];
        },
        removeObjects: async (paths) => {
          removed.push(paths);
        },
      },
    );
    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(2);
    expect(removed).toEqual([[
      `rg-motors/${SLUG}/spin/intento2/m900/001.webp`,
      `rg-motors/${SLUG}/spin/intento2/m900/002.webp`,
    ]]);
    expect(JSON.stringify(removed)).not.toContain("oldver");
    expect(JSON.stringify(removed)).not.toContain("mvjnpp9vui5jn5");
  });
});
