import { describe, expect, it } from "vitest";
import {
  filterExcludedDriveImages,
  isHeicHeifOrDng,
  isImportableDriveImage,
  looksLikeRasterImage,
  renderedThumbnailUrl,
} from "./driveImageFormats";

describe("formatos de Drive", () => {
  it("reconoce HEIC, HEIF y DNG por mime o extensión", () => {
    expect(isHeicHeifOrDng("IMG.HEIC", "application/octet-stream")).toBe(true);
    expect(isHeicHeifOrDng("foto", "image/heif")).toBe(true);
    expect(isHeicHeifOrDng("raw", "image/heic-sequence")).toBe(true);
    expect(isHeicHeifOrDng("JRTH26.dng", "")).toBe(true);
    expect(isHeicHeifOrDng("pro.DNG", "image/x-adobe-dng")).toBe(true);
    expect(isHeicHeifOrDng("1.jpg", "image/jpeg")).toBe(false);
  });

  it("importa raw aunque Drive no mande image/*", () => {
    expect(isImportableDriveImage("SGYL33.HEIC", "application/octet-stream")).toBe(true);
    expect(isImportableDriveImage("SBZG55 (1).jpg", "")).toBe(true);
    expect(isImportableDriveImage("foto.tif", "application/octet-stream")).toBe(true);
    expect(isImportableDriveImage("notas.txt", "text/plain")).toBe(false);
    expect(isImportableDriveImage("clip.mp4", "video/mp4")).toBe(false);
  });

  it("pide el thumbnail a s2000", () => {
    expect(
      renderedThumbnailUrl(
        "https://lh3.googleusercontent.com/d/abc=s220",
        "abc",
      ),
    ).toBe("https://lh3.googleusercontent.com/d/abc=s2000");
    expect(
      renderedThumbnailUrl(
        "https://drive.google.com/thumbnail?id=abc&sz=w220",
        "abc",
      ),
    ).toBe("https://drive.google.com/thumbnail?id=abc&sz=w2000");
  });

  it("no usa un thumbnailLink que no sea de Google", () => {
    expect(renderedThumbnailUrl("https://evil.example/x=s220", "file1")).toBe(
      "https://lh3.googleusercontent.com/d/file1=s2000",
    );
  });

  it("acepta un JPEG y rechaza un HTML chico", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(900)]);
    expect(looksLikeRasterImage(jpeg)).toBe(true);
    expect(looksLikeRasterImage(Buffer.from("<html>no</html>"))).toBe(false);
  });
});

describe("filterExcludedDriveImages", () => {
  it("quita IDs excluidos y originales DNG/HEIC con versión _orig_ al lado", () => {
    const imgs = [
      { id: "12D04_wWgeTBDxRV2UDplNHYBVpjiX-rI", name: "odo.jpg", mimeType: "image/jpeg" },
      { id: "1oJ7thS3T9L2BFpllk8LrHHClDXQ15jJd", name: "pat.jpg", mimeType: "image/jpeg" },
      { id: "a", name: "IMG_2058.DNG", mimeType: "image/x-adobe-dng" },
      { id: "b", name: "KHFG83_orig_2058.jpg", mimeType: "image/jpeg" },
      { id: "c", name: "IMG_2059.HEIC", mimeType: "image/heic" },
      { id: "d", name: "IMG_2058.jpg", mimeType: "image/jpeg" },
    ];
    expect(filterExcludedDriveImages(imgs).map((i) => i.id)).toEqual(["b", "c", "d"]);
  });
});
