/**
 * Modo de fotos del sitio público.
 *
 * Por defecto ("placeholder") la vitrina muestra TODOS los autos como si aún
 * no tuvieran fotos: solo la imagen "Fotografías en preparación", sin galería,
 * sin giro 360°, sin contador de fotos y sin URLs de fotos reales en el HTML,
 * el JSON de la API, el JSON-LD ni los metadatos. Textos, precios y demás
 * datos del auto no cambian.
 *
 * No toca datos: las fotos siguen en Supabase/Storage/Drive y el admin las ve
 * igual. Para volver a mostrar fotos reales: definir
 * NEXT_PUBLIC_PHOTOS_MODE=real en Vercel y redeployar (o revertir este cambio).
 */
export const PENDING_PHOTO = "/images/placeholder-pending-car.svg";

export function isPlaceholderPhotosMode(): boolean {
  const raw = (process.env.NEXT_PUBLIC_PHOTOS_MODE || "").trim().toLowerCase();
  return raw !== "real";
}

type PhotoFields = {
  image?: string;
  gallery?: string[];
  spin?: unknown;
  hasRealPhotos?: boolean;
};

/** Versión pública del vehículo: en modo placeholder quita toda foto real. */
export function withPublicPhotos<T extends PhotoFields>(vehicle: T): T {
  if (!isPlaceholderPhotosMode()) return vehicle;
  return {
    ...vehicle,
    image: PENDING_PHOTO,
    gallery: [],
    spin: undefined,
    hasRealPhotos: false,
  };
}
