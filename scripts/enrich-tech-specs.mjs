/**
 * Aplica fichas técnicas al stock y regenera lib/vehicles.ts correctamente.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const { enrichVehicleTechSpec } = await import(
  pathToFileURL(path.join(ROOT, "scripts/lib/tech-specs.mjs")).href
);

const vehiclesPath = path.join(ROOT, "data", "vehicles.json");
const enriched = JSON.parse(fs.readFileSync(vehiclesPath, "utf8")).map((v) =>
  enrichVehicleTechSpec(v),
);
fs.writeFileSync(vehiclesPath, JSON.stringify(enriched, null, 2), "utf8");

const header = `// Stock importado desde "total inventario tiempo real.xlsx" (primeros 40 con precio válido)

export interface VehicleSpin {
  count: number;
  pattern?: string;
  ext?: string;
}

export interface Vehicle {
  slug: string;
  plate?: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  price: number;
  listPrice?: number;
  km: number;
  fuel: string;
  transmission: string;
  bodyType: string;
  location: string;
  image: string;
  gallery?: string[];
  spin?: VehicleSpin;
  engine: string;
  power: string;
  traction: string;
  doors: number;
  owners: number;
  featured?: boolean;
  status?: "Disponible" | "En reserva" | "Vendido" | "Borrador" | "En preparación";
  hasRealPhotos?: boolean;
  supplier?: string;
  techReview?: string;
  circPermit?: string;
  highlights?: string[];
}

export const initialVehicles: Vehicle[] = `;

const footer = `;

export const HERO_SHOWCASE_VEHICLES: Vehicle[] = initialVehicles
  .filter((v) => v.featured && v.hasRealPhotos)
  .slice(0, 6);

export const vehicles: Vehicle[] = initialVehicles;

export function getVehicle(slug: string): Vehicle | undefined {
  return vehicles.find((v) => v.slug === slug);
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatKm(km: number): string {
  return \`\${km.toLocaleString("es-CL")} km\`;
}

export function spinFramesOf(v: Vehicle): string[] {
  if (!v.spin || v.spin.count <= 0) return [];
  const ext = v.spin.ext ?? "jpg";
  const pattern = v.spin.pattern ?? \`/cars/spin/\${v.slug}/{i}.\${ext}\`;
  return Array.from({ length: v.spin.count }, (_, i) =>
    pattern.replace("{i}", String(i + 1).padStart(3, "0")),
  );
}

export function specsOf(v: Vehicle): { label: string; value: string }[] {
  return [
    { label: "Motor", value: v.engine },
    { label: "Potencia", value: v.power },
    { label: "Transmisión", value: v.transmission },
    { label: "Tracción", value: v.traction },
    { label: "Combustible", value: v.fuel },
    { label: "Puertas", value: String(v.doors) },
  ];
}

export const BRANDS = [...new Set(vehicles.map((v) => v.brand))].sort();
export const BODY_TYPES = [...new Set(vehicles.map((v) => v.bodyType))];
export const FUELS = [...new Set(vehicles.map((v) => v.fuel))];
export const TRANSMISSIONS = [...new Set(vehicles.map((v) => v.transmission))];
export const STATUS_TYPES = ["Disponible", "En reserva", "Vendido", "Borrador", "En preparación"] as const;
`;

fs.writeFileSync(
  path.join(ROOT, "lib", "vehicles.ts"),
  header + JSON.stringify(enriched, null, 2) + footer,
  "utf8",
);

console.log(`OK ${enriched.length} fichas · lib/vehicles.ts regenerado`);
console.log(
  "Ejemplo:",
  enriched
    .filter((v) => /KATANA 4X2|HILUX SR 4X4/.test(v.model) && [2024].includes(v.year))
    .map((v) => `${v.plate} ${v.engine} ${v.power} ${v.doors}p`)
    .join(" | "),
);
