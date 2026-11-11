/**
 * Fotos del sitio público.
 *
 * Cada vehículo muestra sus fotos reales (galería, contador, og:image y giro 360)
 * cuando tiene al menos una. El placeholder "Fotografías en preparación" aparece
 * solo si ese vehículo no tiene ninguna foto. No se tocan los datos: el admin
 * sigue subiendo y viendo las fotos igual.
 *
 * NEXT_PUBLIC_PHOTOS_MODE ya no fuerza el placeholder en toda la vitrina,
 * aunque quede definido en Vercel.
 */
export const PENDING_PHOTO = "/images/placeholder-pending-car.svg";

const PLACEHOLDER_RE = /placeholder-pending|fotos-en-proceso/i;

type PhotoFields = {
  image?: string;
  gallery?: string[];
  spin?: unknown;
  hasRealPhotos?: boolean;
};

function isRealPhoto(src?: string | null): boolean {
  if (!src) return false;
  const value = String(src).trim();
  return Boolean(value) && !PLACEHOLDER_RE.test(value);
}

export function hasPublicPhotos(vehicle: PhotoFields): boolean {
  if (isRealPhoto(vehicle.image)) return true;
  return Array.isArray(vehicle.gallery) && vehicle.gallery.some(isRealPhoto);
}

/** El modo forzado de placeholder global se desactivó. Se conserva por compatibilidad. */
export function isPlaceholderPhotosMode(): boolean {
  return false;
}

/** Versión pública del vehículo: fotos reales si las hay; si no, solo el placeholder. */
export function withPublicPhotos<T extends PhotoFields>(vehicle: T): T {
  if (hasPublicPhotos(vehicle)) {
    const image = isRealPhoto(vehicle.image)
      ? vehicle.image
      : (vehicle.gallery || []).find(isRealPhoto) || vehicle.image;
    return {
      ...vehicle,
      image,
      hasRealPhotos: true,
    };
  }
  return {
    ...vehicle,
    image: PENDING_PHOTO,
    gallery: [],
    spin: undefined,
    hasRealPhotos: false,
  };
}
