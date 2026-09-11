import { describe, expect, it } from "vitest";
import { cacheGet, cacheInvalidate, cacheSet } from "@/lib/server/memoryCache";
import { toVehicleCardDTO } from "@/lib/vehicles/publicFields";
import type { Vehicle } from "@/lib/vehicles";

describe("memoryCache", () => {
  it("guarda y recupera dentro del TTL", () => {
    const key = `t-${Date.now()}-${Math.random()}`;
    cacheSet(key, { ok: true }, 5_000);
    expect(cacheGet<{ ok: boolean }>(key)).toEqual({ ok: true });
    cacheInvalidate(key);
    expect(cacheGet(key)).toBeNull();
  });
});

describe("toVehicleCardDTO", () => {
  it("omite galería completa y resume spin", () => {
    const v = {
      slug: "demo",
      brand: "Toyota",
      model: "RAV4",
      version: "XLE",
      year: 2022,
      price: 18_000_000,
      km: 30000,
      fuel: "Híbrido",
      transmission: "Automática",
      bodyType: "SUV",
      location: "Puerto Montt",
      image: "/cars/x.jpg",
      engine: "2.5",
      power: "200",
      traction: "AWD",
      doors: 5,
      owners: 1,
      featured: true,
      gallery: ["/a.jpg", "/b.jpg", "/c.jpg"],
      spin: { count: 36 },
      hasRealPhotos: true,
    } as Vehicle;

    const dto = toVehicleCardDTO(v);
    expect(dto.galleryCount).toBe(3);
    expect(dto.hasSpin).toBe(true);
    expect(dto.engine).toBe("2.5");
    expect(dto.power).toBe("200");
    expect(dto.doors).toBe(5);
    expect(dto).not.toHaveProperty("gallery");
    expect(dto).not.toHaveProperty("highlights");
    expect(dto.plate).toBeUndefined();
  });
});
