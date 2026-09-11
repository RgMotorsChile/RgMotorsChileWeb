import type { Vehicle } from "@/lib/vehicles";

/** Campos mínimos para cards de catálogo / listados (payload liviano). */
export type VehicleCardDTO = Pick<
  Vehicle,
  | "slug"
  | "brand"
  | "model"
  | "version"
  | "year"
  | "price"
  | "km"
  | "fuel"
  | "transmission"
  | "bodyType"
  | "location"
  | "image"
  | "featured"
  | "status"
  | "hasRealPhotos"
  | "engine"
  | "power"
  | "traction"
  | "doors"
> & {
  galleryCount: number;
  hasSpin: boolean;
  /** Nunca se expone al catálogo público. */
  plate?: undefined;
};

/** Quita la patente del payload público (admin sí la ve vía ?admin=true). */
export function stripPlateForPublic<T extends { plate?: string }>(
  vehicle: T,
): Omit<T, "plate"> & { plate?: undefined } {
  const { plate: _plate, ...rest } = vehicle;
  return { ...rest, plate: undefined };
}

export function toVehicleCardDTO(v: Vehicle): VehicleCardDTO {
  return {
    slug: v.slug,
    brand: v.brand,
    model: v.model,
    version: v.version,
    year: v.year,
    price: v.price,
    km: v.km,
    fuel: v.fuel,
    transmission: v.transmission,
    bodyType: v.bodyType,
    location: v.location,
    image: v.image,
    featured: v.featured,
    status: v.status,
    hasRealPhotos: v.hasRealPhotos,
    engine: v.engine,
    power: v.power,
    traction: v.traction,
    doors: v.doors,
    galleryCount: v.gallery?.length ?? 0,
    hasSpin: Boolean(v.spin && v.spin.count > 0),
  };
}
