import { describe, it, expect } from "vitest";
import { classifyBlobs, selectionFingerprint, summarize, toPathname, type BlobItem } from "./blobCleanupCore";

const H = "https://abc123.public.blob.vercel-storage.com/";
const OLD = "2026-09-01T00:00:00Z";
const NOW = new Date("2026-10-21T12:00:00Z").getTime();
const b = (path: string, size = 100, uploadedAt: string = OLD): BlobItem => ({
  url: H + path,
  pathname: path,
  size,
  uploadedAt,
});

describe("classifyBlobs", () => {
  const blobs = [
    b("cars/uploads/hilux-a/1.jpg", 10),
    b("cars/uploads/hilux-a/2.jpg", 10),
    b("cars/uploads/hilux-a/3.jpg", 20),
    b("cars/uploads/hilux-a/foto__r1700000000000.jpg", 30),
    b("cars/uploads/hilux-a/foto.jpg", 30),
    b("cars/uploads/vendido-b/1.jpg", 40),
    b("cars/uploads/hilux-a/nueva.jpg", 5, "2026-10-21T00:00:00Z"),
    b("cars/spin/hilux-a/frame-001.webp", 7),
    b("cars/uploads/hilux-a/spin/frame-001.webp", 7),
    b("site/hero.jpg", 50),
  ];
  const run = (same = true) =>
    classifyBlobs({
      blobs,
      referenced: [H + "cars/uploads/hilux-a/1.jpg?v=2", "/cars/uploads/hilux-a/foto__r1700000000000.jpg"],
      catalogSlugs: ["hilux-a"],
      now: NOW,
      sameContent: async () => same,
    });

  it("protege en uso, originales de reemplazo, recientes, spin y fuera de cars/uploads", async () => {
    const r = await run();
    const paths = r.candidates.map((c) => c.pathname);
    expect(paths).not.toContain("cars/uploads/hilux-a/1.jpg");
    expect(paths).not.toContain("cars/uploads/hilux-a/foto.jpg");
    expect(paths).not.toContain("cars/uploads/hilux-a/foto__r1700000000000.jpg");
    expect(paths).not.toContain("cars/uploads/hilux-a/nueva.jpg");
    expect(paths).not.toContain("cars/uploads/hilux-a/spin/frame-001.webp");
    expect(paths).not.toContain("cars/spin/hilux-a/frame-001.webp");
    expect(paths).not.toContain("site/hero.jpg");
    expect(r.protectedCounts.original_de_reemplazo.count).toBe(1);
    expect(r.protectedCounts.reciente.count).toBe(1);
  });

  it("clasifica vendidos, duplicados (mismo contenido) y antiguos", async () => {
    const r = await run();
    const cat = Object.fromEntries(r.candidates.map((c) => [c.pathname, c.category]));
    expect(cat["cars/uploads/vendido-b/1.jpg"]).toBe("vendidos");
    expect(cat["cars/uploads/hilux-a/2.jpg"]).toBe("duplicados");
    expect(cat["cars/uploads/hilux-a/3.jpg"]).toBe("antiguos");
    expect(summarize(r.candidates).vendidos).toEqual({ count: 1, bytes: 40 });
  });

  it("mismo tamaño pero distinto contenido no es duplicado", async () => {
    const r = await run(false);
    expect(r.candidates.find((c) => c.pathname.endsWith("hilux-a/2.jpg"))?.category).toBe("antiguos");
  });

  it("protege un original aunque su reemplazo solo exista como referencia", async () => {
    const r = await classifyBlobs({
      blobs: [b("cars/uploads/x/a.jpg")],
      referenced: [H + "cars/uploads/x/a__r123.jpg"],
      catalogSlugs: [],
      now: NOW,
    });
    expect(r.candidates).toEqual([]);
  });
});

describe("helpers", () => {
  it("toPathname normaliza URL, query y slash", () => {
    expect(toPathname(H + "cars/uploads/a%20b/1.jpg?x=1")).toBe("cars/uploads/a b/1.jpg");
    expect(toPathname("/cars/uploads/a/1.jpg")).toBe("cars/uploads/a/1.jpg");
  });
  it("la huella cambia si cambia la selección", async () => {
    const one = selectionFingerprint([{ ...b("cars/uploads/a/1.jpg"), category: "vendidos", slug: "a", reason: "" }]);
    expect(one).not.toBe(selectionFingerprint([]));
  });
});
