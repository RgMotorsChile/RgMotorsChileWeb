/**
 * Datos visibles de la ficha. Si el valor no está, se omite.
 * "Por confirmar", vacío o 0 no se inventan ni se muestran como dato.
 */

const UNKNOWN = /^(por confirmar|consultar|pendiente|n\/?a|s\/?d|—|-|–)$/i;

export function isKnownSpec(value: string | number | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  const text = value.trim();
  return text !== "" && !UNKNOWN.test(text);
}

export function formatKm(km: number): string {
  return `${new Intl.NumberFormat("es-CL").format(km)} km`;
}

export type SpecItem = { label: string; value: string };

export function vehicleSpecBar(vehicle: {
  km?: number;
  version?: string;
  model?: string;
  year?: number;
  fuel?: string;
  transmission?: string;
  traction?: string;
}): SpecItem[] {
  const rows: SpecItem[] = [];
  if (isKnownSpec(vehicle.km)) rows.push({ label: "Kilómetros", value: formatKm(Number(vehicle.km)) });
  const version = String(vehicle.version || "").trim();
  const model = String(vehicle.model || "").trim();
  if (isKnownSpec(version) && version.toLowerCase() !== model.toLowerCase()) {
    rows.push({ label: "Versión", value: version });
  }
  if (isKnownSpec(vehicle.year) && Number(vehicle.year) >= 1980 && Number(vehicle.year) <= 2035) {
    rows.push({ label: "Año", value: String(vehicle.year) });
  }
  if (isKnownSpec(vehicle.fuel)) rows.push({ label: "Combustible", value: String(vehicle.fuel).trim() });
  if (isKnownSpec(vehicle.transmission)) {
    rows.push({ label: "Transmisión", value: String(vehicle.transmission).trim() });
  }
  if (isKnownSpec(vehicle.traction)) rows.push({ label: "Tracción", value: String(vehicle.traction).trim() });
  return rows;
}
