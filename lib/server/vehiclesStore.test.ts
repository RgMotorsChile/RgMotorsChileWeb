import { describe, it, expect } from "vitest";
import { getVehicles, getVehicleBySlug } from "./vehiclesStore";

describe("vehiclesStore", () => {
  it("loads the list of vehicles", async () => {
    const list = await getVehicles();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty("slug");
    expect(list[0]).toHaveProperty("brand");
    expect(list[0]).toHaveProperty("price");
  });

  it("finds a vehicle by slug from current stock", async () => {
    const list = await getVehicles();
    const sample = list[0];
    expect(sample).toBeDefined();

    const found = await getVehicleBySlug(sample.slug);
    expect(found).toBeDefined();
    expect(found?.brand).toBe(sample.brand);
    expect(found?.slug).toBe(sample.slug);
  });

  it("normalizes Pickup bodyType to Camioneta", async () => {
    const list = await getVehicles();
    expect(list.every((v) => v.bodyType !== "Pickup")).toBe(true);
    expect(list.some((v) => v.bodyType === "Camioneta")).toBe(true);
  });

  it("no publica menciones a la financiera en los destacados", async () => {
    const list = await getVehicles();
    const texts = list.flatMap((v) => v.highlights ?? []);
    expect(texts.some((h) => /autofin/i.test(h))).toBe(false);
  });
});
