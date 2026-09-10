import { describe, expect, it } from "vitest";
import {
  mediaUrlsEqual,
  normalizeMediaUrl,
  orderGalleryWithCover,
  resolveCoverFromGallery,
  withFrontCover,
} from "@/lib/vehicles/frontCoverMap";

describe("withFrontCover", () => {
  it("no fuerza portada: deja image/gallery como están", () => {
    const other =
      "https://abc123.public.blob.vercel-storage.com/cars/uploads/ford-raptor-f150-2020-lrjy32/photo-05.jpg";
    const cover =
      "https://abc123.public.blob.vercel-storage.com/cars/uploads/ford-raptor-f150-2020-lrjy32/photo-02.jpg";
    const v = withFrontCover({
      slug: "ford-raptor-f150-2020-lrjy32",
      image: other,
      gallery: [other, cover],
      hasRealPhotos: true,
    });
    expect(v.image).toBe(other);
    expect(v.gallery).toEqual([other, cover]);
  });
});

describe("normalizeMediaUrl", () => {
  it("conserva el id de Drive (no corta el query)", () => {
    expect(
      normalizeMediaUrl("https://drive.google.com/thumbnail?id=ABC123&sz=w800"),
    ).toBe("https://drive.google.com/thumbnail?id=ABC123&sz=w1000");
  });

  it("quita query de Blob (cache-bust)", () => {
    expect(
      normalizeMediaUrl(
        "https://abc.public.blob.vercel-storage.com/cars/x.jpg?t=123",
      ),
    ).toBe("https://abc.public.blob.vercel-storage.com/cars/x.jpg");
  });
});

describe("mediaUrlsEqual", () => {
  it("iguala por fileId de Drive aunque cambie sz", () => {
    expect(
      mediaUrlsEqual(
        "https://drive.google.com/thumbnail?id=ABC&sz=w1000",
        "https://drive.google.com/thumbnail?id=ABC&sz=w400",
      ),
    ).toBe(true);
  });
});

describe("resolveCoverFromGallery", () => {
  it("conserva la portada previa si el fileId de Drive sigue en la galería", () => {
    const prev = "https://drive.google.com/thumbnail?id=ABC123&sz=w1000";
    const gallery = [
      "https://drive.google.com/thumbnail?id=ZZZ999&sz=w1000",
      "https://drive.google.com/thumbnail?id=ABC123&sz=w800",
    ];
    expect(resolveCoverFromGallery(prev, gallery)).toBe(gallery[1]);
  });

  it("usa la primera si la portada previa ya no está", () => {
    const gallery = [
      "https://drive.google.com/thumbnail?id=NEW1&sz=w1000",
      "https://drive.google.com/thumbnail?id=NEW2&sz=w1000",
    ];
    expect(
      resolveCoverFromGallery(
        "https://drive.google.com/thumbnail?id=OLD&sz=w1000",
        gallery,
      ),
    ).toBe(gallery[0]);
  });

  it("ordena con la portada al frente", () => {
    expect(orderGalleryWithCover("b", ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
});
