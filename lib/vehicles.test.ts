import { describe, expect, it } from "vitest";
import { formatCLP, spinMetadataForEditorSave, vehicles } from "@/lib/vehicles";

describe("formatCLP()", () => {
  it("formatea montos en pesos chilenos", () => {
    const formatted = formatCLP(15990000);
    expect(formatted).toContain("15");
    expect(formatted).toMatch(/\$|CLP|15/);
  });
});

describe("spinMetadataForEditorSave()", () => {
  it("no fuerza ext jpg cuando el giro ya tiene patrón WebP o AVIF", () => {
    expect(
      spinMetadataForEditorSave(true, 36, {
        count: 36,
        ext: "jpg",
        front: 0,
        pattern: "https://example.test/m900/{i}.webp",
        hiPattern: "https://example.test/d1600/{i}.avif",
      }),
    ).toEqual({
      count: 36,
      front: 0,
      pattern: "https://example.test/m900/{i}.webp",
      hiPattern: "https://example.test/d1600/{i}.avif",
    });
    expect(spinMetadataForEditorSave(true, 24, undefined)).toEqual({ count: 24 });
    expect(
      spinMetadataForEditorSave(false, 24, {
        count: 24,
        pattern: "https://example.test/m900/{i}.webp",
      }),
    ).toBeUndefined();
  });
});

describe("vehicles catalog", () => {
  it("tiene al menos un vehículo con slug", () => {
    expect(vehicles.length).toBeGreaterThan(0);
    expect(vehicles[0]?.slug).toBeTruthy();
  });
});
