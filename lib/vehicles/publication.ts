import { BRANCH_ASSIGNMENTS, externalUrlForPlate, publishesOnRg } from "./branch";
import { plateToken, publicVehicleSlug, slugMatchesVehicle, type SlugSource } from "./publicSlug";

export type PublicationHit =
  | { type: "render" }
  | { type: "redirect"; to: string }
  | { type: "gone" }
  | { type: "missing" };

export function publicationDecision(
  requested: string,
  vehicle: (SlugSource & { branch?: string }) | null,
): PublicationHit {
  const moved = externalUrlForPlate(plateToken({ slug: requested }));
  if (!vehicle) {
    return moved ? { type: "redirect", to: moved } : { type: "missing" };
  }
  if (!slugMatchesVehicle(vehicle, requested) && moved) {
    return { type: "redirect", to: moved };
  }
  if (!publishesOnRg(vehicle)) {
    const assigned = BRANCH_ASSIGNMENTS[vehicle.slug];
    if (assigned?.externalUrl) return { type: "redirect", to: assigned.externalUrl };
    return { type: "gone" };
  }
  const next = publicVehicleSlug(vehicle);
  if (requested !== next) return { type: "redirect", to: `/vehiculo/${next}` };
  return { type: "render" };
}
