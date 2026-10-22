import { formatCLP } from "@/lib/vehicles";
import { scrubPlate } from "@/lib/vehicles/publicSlug";

export const SITE_ORIGIN = "https://www.rgmotorschile.cl";

function titleWord(word: string): string {
  if (!word) return "";
  if (/^4x[24]$/i.test(word)) return word.toLowerCase();
  if (/^\d/.test(word)) return word;
  if (/^(gl|gt|lt|mt|at|sr|dx|xe|cd|dc|hp|hdi)$/i.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCase(value: string): string {
  return value
    .replace(/[·|]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(titleWord)
    .join(" ");
}

/** Marca, modelo, versión y año, sin repetir el modelo dentro de la versión y sin patente. */
export function vehicleHeadline(vehicle: {
  brand: string;
  model: string;
  version?: string;
  year: number;
  plate?: string;
}): string {
  const modelTokens = new Set(titleCase(vehicle.model).toLowerCase().split(" "));
  const versionTokens = titleCase(vehicle.version || "")
    .split(" ")
    .filter((token) => token && !modelTokens.has(token.toLowerCase()) && token !== String(vehicle.year));
  const parts = [titleCase(vehicle.brand), titleCase(vehicle.model), versionTokens.join(" "), String(vehicle.year)];
  return scrubPlate(parts.filter(Boolean).join(" ").replace(/\s+/g, " "), vehicle.plate);
}

export function vehicleDocumentTitle(vehicle: {
  brand: string;
  model: string;
  version?: string;
  year: number;
  plate?: string;
}): string {
  return `${vehicleHeadline(vehicle)} usado en Puerto Montt | RG Motors`;
}

export function vehicleMetaDescription(vehicle: {
  brand: string;
  model: string;
  version?: string;
  year: number;
  price: number;
  plate?: string;
}): string {
  const name = vehicleHeadline(vehicle);
  const price = vehicle.price > 0 ? ` por ${formatCLP(vehicle.price)}` : "";
  return scrubPlate(
    `${name} en Puerto Montt${price}. Escríbenos por WhatsApp y agenda tu visita en Av. Cardonal.`,
    vehicle.plate,
  );
}
