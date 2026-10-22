import { publicVehicleSlug, type SlugSource } from "./publicSlug";

export type PublicationHit =
  | { type: "render" }
  | { type: "redirect"; to: string }
  | { type: "gone" }
  | { type: "missing" };

/**
 * La única redirección es la de la URL con patente al slug nuevo, en este mismo host.
 * Si el auto ya no está en el catálogo, no hay destino en otro sitio.
 */
export function publicationDecision(
  requested: string,
  vehicle: (SlugSource & { branch?: string }) | null,
): PublicationHit {
  if (!vehicle) return { type: "missing" };
  const next = publicVehicleSlug(vehicle);
  if (requested !== next) return { type: "redirect", to: `/vehiculo/${next}` };
  return { type: "render" };
}
