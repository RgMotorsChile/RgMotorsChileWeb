import { afterEach, describe, expect, it, vi } from "vitest";
import { verifiedGallery, isPlaceholderPhoto } from "./verifyPhotos";
import { buildLeadEmailHtml } from "./notify";

describe("verifiedGallery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("quita URLs Blob 404, duplicados y placeholders; conserva errores de red", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("gone")) return new Response(null, { status: 404 });
      if (url.includes("flaky")) throw new Error("timeout");
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifiedGallery("https://x.public.blob.vercel-storage.com/a.jpg", [
      "https://x.public.blob.vercel-storage.com/a.jpg",
      "https://x.public.blob.vercel-storage.com/gone.jpg",
      "https://x.public.blob.vercel-storage.com/flaky.jpg",
      "/images/placeholder-pending-car.svg",
    ]);
    expect(out).toEqual([
      "https://x.public.blob.vercel-storage.com/a.jpg",
      "https://x.public.blob.vercel-storage.com/flaky.jpg",
    ]);
  });

  it("sin fotos reales devuelve lista vacía (placeholder estable)", async () => {
    expect(await verifiedGallery("/images/placeholder-pending-car.svg", [])).toEqual([]);
    expect(isPlaceholderPhoto(undefined)).toBe(true);
  });
});

describe("buildLeadEmailHtml", () => {
  it("escapa todo lo que escribe el visitante", () => {
    const html = buildLeadEmailHtml("Contacto", [["Nombre", `<script>alert("x")</script>`], ["Msg", "a'b"]]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a&#39;b");
  });
});
