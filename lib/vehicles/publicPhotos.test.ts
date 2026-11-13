import { afterEach, describe, expect, it } from "vitest";
import { isPlaceholderPhotosMode, PENDING_PHOTO, withPublicPhotos } from "./publicPhotos";
import { toVehicleCardDTO, toPublicVehicle } from "./publicFields";
import type { Vehicle } from "@/lib/vehicles";

const REAL = "https://tuybpizjeszgwtcvunmp.supabase.co/storage/v1/object/public/vehicle-photos/rg-motors/x/a.jpg";

const car = {
  slug: "toyota-hilux-2022-abcd12",
  plate: "ABCD 12",
  brand: "Toyota",
  model: "Hilux",
  version: "SR",
  year: 2022,
  price: 15_990_000,
  km: 50_000,
  fuel: "Diésel",
  transmission: "Manual",
  bodyType: "Camioneta",
  location: "Puerto Montt",
  image: REAL,
  gallery: [REAL, `${REAL}?2`],
  spin: { count: 36, pattern: "/cars/spin/x/{i}.jpg" },
  engine: "2.4",
  power: "150 HP",
  traction: "4x4",
  doors: 4,
  hasRealPhotos: true,
  highlights: ["Fotos reales de patio", "Mantenciones al día"],
} as unknown as Vehicle;

const emptyCar = {
  ...car,
  image: PENDING_PHOTO,
  gallery: [],
  spin: undefined,
  hasRealPhotos: false,
} as unknown as Vehicle;

const prev = process.env.NEXT_PUBLIC_PHOTOS_MODE;
afterEach(() => {
  if (prev === undefined) delete process.env.NEXT_PUBLIC_PHOTOS_MODE;
  else process.env.NEXT_PUBLIC_PHOTOS_MODE = prev;
});

describe("modo de fotos público", () => {
  it("por defecto muestra las fotos reales del vehículo", () => {
    delete process.env.NEXT_PUBLIC_PHOTOS_MODE;
    expect(isPlaceholderPhotosMode()).toBe(false);
    const v = toPublicVehicle(car);
    expect(v.image).toBe(REAL);
    expect(v.gallery).toHaveLength(2);
    expect(v.spin).toEqual(car.spin);
    expect(v.hasRealPhotos).toBe(true);
    expect(v.highlights).toEqual(["Fotos reales de patio", "Mantenciones al día"]);
    expect(v.price).toBe(car.price);
    expect(JSON.stringify(v)).toContain("supabase.co");
    const card = toVehicleCardDTO(car);
    expect(card.image).toBe(REAL);
    expect(card.galleryCount).toBe(2);
    expect(card.hasSpin).toBe(true);
    expect(card.hasRealPhotos).toBe(true);
  });

  it("si el auto no tiene fotos, muestra solo el placeholder", () => {
    const v = toPublicVehicle(emptyCar);
    expect(v.image).toBe(PENDING_PHOTO);
    expect(v.gallery).toEqual([]);
    expect(v.spin).toBeUndefined();
    expect(v.hasRealPhotos).toBe(false);
    const card = toVehicleCardDTO(emptyCar);
    expect(card.image).toBe(PENDING_PHOTO);
    expect(card.galleryCount).toBe(0);
    expect(card.hasSpin).toBe(false);
    expect(card.hasRealPhotos).toBe(false);
  });

  it("no modifica el objeto original (los datos quedan intactos)", () => {
    delete process.env.NEXT_PUBLIC_PHOTOS_MODE;
    withPublicPhotos(car);
    expect(car.image).toBe(REAL);
    expect(car.gallery).toHaveLength(2);
  });

  it("ignora NEXT_PUBLIC_PHOTOS_MODE y sigue mostrando las fotos reales", () => {
    process.env.NEXT_PUBLIC_PHOTOS_MODE = "placeholder";
    expect(isPlaceholderPhotosMode()).toBe(false);
    const v = toPublicVehicle(car);
    expect(v.image).toBe(REAL);
    expect(v.gallery).toHaveLength(2);
  });
});
