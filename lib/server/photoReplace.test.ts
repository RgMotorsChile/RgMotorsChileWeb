import { describe, expect, it } from "vitest";
import {
  buildReplacementPath,
  stripReplacedSuffix,
  swapPhotoUrl,
  validateReplacementFile,
  REPLACE_MAX_BYTES,
} from "./photoReplace";
import { driveFileNeedsSync } from "./drivePlateMatch";

const B = "https://x.public.blob.vercel-storage.com/cars/uploads/auto-1";

describe("photoReplace", () => {
  it("valida tipo y tamaño en el servidor", () => {
    expect(validateReplacementFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateReplacementFile({ name: "a.heic", type: "", size: 1000 })).toBeNull();
    expect(validateReplacementFile({ name: "a.pdf", type: "application/pdf", size: 1000 })).toMatch(/no es una imagen/);
    expect(validateReplacementFile({ name: "a.jpg", type: "text/html", size: 1000 })).toMatch(/no es una imagen/);
    expect(validateReplacementFile({ name: "a.jpg", type: "image/jpeg", size: REPLACE_MAX_BYTES + 1 })).toMatch(/pesa/);
    expect(validateReplacementFile({ name: "a.jpg", type: "image/jpeg", size: 0 })).toMatch(/vacío/);
  });

  it("ruta nueva conserva el id de Drive y no se apila el sufijo", () => {
    expect(buildReplacementPath("auto-1", `${B}/1AbC_d-9.jpg`, "jpg", 5)).toBe("cars/uploads/auto-1/1AbC_d-9__r5.jpg");
    expect(buildReplacementPath("auto-1", `${B}/1AbC_d-9__r5.jpg?v=1`, "png", 7)).toBe("cars/uploads/auto-1/1AbC_d-9__r7.png");
    expect(stripReplacedSuffix("1AbC__r123")).toBe("1AbC");
  });

  it("mantiene posición en la galería y portada", () => {
    const v = { image: `${B}/b.jpg`, gallery: [`${B}/a.jpg`, `${B}/b.jpg`, `${B}/c.jpg`] };
    const r = swapPhotoUrl(v, `${B}/b.jpg`, `${B}/b__r1.jpg`)!;
    expect(r.gallery).toEqual([`${B}/a.jpg`, `${B}/b__r1.jpg`, `${B}/c.jpg`]);
    expect(r.image).toBe(`${B}/b__r1.jpg`);
    const r2 = swapPhotoUrl(v, `${B}/c.jpg`, `${B}/c__r1.jpg`)!;
    expect(r2.image).toBe(`${B}/b.jpg`);
    expect(r2.gallery[2]).toBe(`${B}/c__r1.jpg`);
    expect(swapPhotoUrl(v, `${B}/otra.jpg`, "x")).toBeNull();
  });

  it("el sync no vuelve a bajar una foto reemplazada a mano", () => {
    const file = { id: "1AbC", modifiedTime: "2026-12-01T00:00:00Z" };
    expect(driveFileNeedsSync(file, { blobUrl: `${B}/1AbC.jpg`, modifiedTime: "2026-10-01T00:00:00Z" })).toBe(true);
    expect(
      driveFileNeedsSync(file, {
        blobUrl: `${B}/1AbC__r1.jpg`,
        modifiedTime: "2026-10-01T00:00:00Z",
        manualReplacedAt: "2026-10-20T00:00:00Z",
      }),
    ).toBe(false);
  });
});
