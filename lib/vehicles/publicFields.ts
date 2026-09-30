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

type HiddenFromPublic = {
  plate?: string;
  /** Precio de lista: la vitrina muestra solo `price`. */
  listPrice?: number;
  coverLocked?: boolean;
  supplier?: string;
  techReview?: string;
  circPermit?: string;
  payload?: unknown;
};

/**
 * Payload de vitrina. Quita patente y columnas internas
 * (proveedor, revisión técnica, permiso, portada bloqueada, precio lista, payload).
 * El admin autenticado sigue recibiendo el vehículo completo vía `?admin=true`.
 */
export function stripPlateForPublic<T extends HiddenFromPublic>(
  vehicle: T,
): Omit<T, keyof HiddenFromPublic> {
  const {
    plate: _plate,
    listPrice: _listPrice,
    coverLocked: _coverLocked,
    supplier: _supplier,
    techReview: _techReview,
    circPermit: _circPermit,
    payload: _payload,
    ...rest
  } = vehicle;
  return rest;
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
