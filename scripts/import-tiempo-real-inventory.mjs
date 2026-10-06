/**
 * Importa stock desde "total inventario tiempo real.xlsx"
 * - Solo hoja: rg motors (no unidades chile ni salgado)
 * - Solo unidades con precio válido (excluye FALTA FOTOS/PRECIO/PREPARACION)
 * - Excluye vendidos
 * - Carga hasta 40 en orden del Excel
 * - Reutiliza fotos locales en public/cars/uploads por patente
 *
 * Uso: node scripts/import-tiempo-real-inventory.mjs
 */
import XLSX from "xlsx";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pickFrontCoverFile } from "./lib/front-cover-map.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EXCEL = join(ROOT, "total inventario tiempo real.xlsx");
const UPLOADS = join(ROOT, "public", "cars", "uploads");
const LIMIT = 40;

function cleanPlate(p) {
  return String(p || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function formatPlate(plate) {
  if (plate.length === 6) return `${plate.slice(0, 4)} ${plate.slice(4)}`;
  return plate;
}

function cleanBrand(b) {
  const s = String(b || "Otro").trim().toUpperCase();
  const map = {
    MITSUBISHI: "Mitsubishi",
    TOYOTA: "Toyota",
    PEUGEOT: "Peugeot",
    NISSAN: "Nissan",
    CHEVROLET: "Chevrolet",
    FORD: "Ford",
    VOLKSWAGEN: "Volkswagen",
    VOLSWAGEN: "Volkswagen",
    MAXUS: "Maxus",
    MG: "MG",
    SSANGYONG: "SsangYong",
    SSANYONG: "SsangYong",
    HYUNDAI: "Hyundai",
    RENAULT: "Renault",
    MERCEDEZ: "Mercedes-Benz",
    "MERCEDES-BENZ": "Mercedes-Benz",
    SUBARU: "Subaru",
    OMODA: "Omoda",
    CHANGAN: "Changan",
    HINO: "Hino",
    RAM: "RAM",
    JAC: "JAC",
    FIAT: "Fiat",
    CHERY: "Chery",
    SUZUKI: "Suzuki",
    KIA: "Kia",
  };
  return map[s] || s.charAt(0) + s.slice(1).toLowerCase();
}

function cleanColor(c) {
  if (!c) return "Blanco";
  const cl = String(c).trim().toLowerCase();
  if (cl.includes("rojo")) return "Rojo";
  if (cl.includes("blanco")) return "Blanco";
  if (cl.includes("gris") || cl.includes("platead") || cl.includes("plata")) return "Gris";
  if (cl.includes("azul")) return "Azul";
  if (cl.includes("negro")) return "Negro";
  if (cl.includes("celeste")) return "Celeste";
  if (cl.includes("verde")) return "Verde";
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

function parsePrice(raw) {
  const str = String(raw || "");
  if (!str.trim()) return 0;
  if (/falta|preparacion|reservado|taller|consignado|rq|fotos|terminar|topon/i.test(str)) return 0;
  const clean = str.replace(/[^0-9]/g, "");
  if (!clean) return 0;
  let n = parseInt(clean, 10);
  if (n > 100_000_000) n = Math.round(n / 100);
  return n >= 500_000 ? n : 0;
}

function bodyType(model) {
  const m = (model || "").toLowerCase();
  if (/katana|hilux|dmax|d-max|colorado|ranger|raptor|saveiro|amarok|t60|musso|terrano|navara/.test(m))
    return "Camioneta";
  if (/partner|expert|v700|fiorino/.test(m)) return "Furgón";
  if (/porter|xzu|x200/.test(m)) return "Camión";
  if (/raize|tucson|zs|tracker|montero|tiggo|ecosport|jimny|duster|tahoe|c5|ml300/.test(m))
    return "SUV";
  if (/wrx|alsvin|3 hatch/.test(m)) return "Sedán";
  if (/spark|i10|morning|rio|baleno|swift/.test(m)) return "Hatchback";
  return "Camioneta";
}

function fuel(model) {
  const m = (model || "").toLowerCase();
  if (/raize|saveiro|duster|wrx|spark|alsvin|tahoe|zs|tracker|baleno|swift|morning|ecosport|tiggo|sti/.test(m))
    return "Bencina";
  return "Diésel";
}

function transmission(model) {
  const m = (model || "").toLowerCase();
  if (/\baut\b|\bat\b|autom|raptor|tahoe|colorado|c5|ml300/.test(m)) return "Automática";
  return "Manual";
}

function traction(model) {
  const m = (model || "").toLowerCase();
  if (/4x4|4wd|awd/.test(m)) return "4x4";
  if (/4x2|2wd/.test(m)) return "4x2";
  return "4x2";
}

function slugify(brand, model, year, plate) {
  return `${brand}-${model}-${year}-${plate}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadPhotoIndex() {
  const map = new Map();
  if (!existsSync(UPLOADS)) return map;
  for (const dir of readdirSync(UPLOADS)) {
    const m = dir.match(/-([a-z0-9]+)$/i);
    if (!m) continue;
    const plate = m[1].toUpperCase();
    const abs = join(UPLOADS, dir);
    const files = readdirSync(abs)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort();
    if (!files.length) continue;
    // Portada canónica: perfil delantero 3/4 (mapa curado)
    const preferred = pickFrontCoverFile(dir, files);
    const cover = `/cars/uploads/${dir}/${preferred}`;
    const rest = files.filter((f) => f !== preferred).map((f) => `/cars/uploads/${dir}/${f}`);
    map.set(plate, {
      dir,
      cover,
      gallery: [cover, ...rest],
    });
  }
  return map;
}

function loadExistingByPlate() {
  const map = new Map();
  const candidates = [
    join(ROOT, "data", "_prev-by-plate.json"),
    join(ROOT, "data", "vehicles.json"),
  ];
  for (const jsonPath of candidates) {
    if (!existsSync(jsonPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
      if (Array.isArray(raw)) {
        for (const v of raw) {
          const p = cleanPlate(v.plate);
          if (p && !map.has(p)) map.set(p, v);
        }
      } else if (raw && typeof raw === "object") {
        for (const [p, v] of Object.entries(raw)) {
          const plate = cleanPlate(p);
          if (plate && !map.has(plate)) map.set(plate, v);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return map;
}

function buildVehicles() {
  const wb = XLSX.readFile(EXCEL);
  const photos = loadPhotoIndex();
  const existing = loadExistingByPlate();
  const sheets = ["rg motors"];
  const ready = [];

  for (const name of sheets) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    for (const r of rows) {
      const plate = cleanPlate(r.PATENTE);
      if (plate.length !== 6) continue;
      const siga = String(r.SIGA || "");
      if (/vendido/i.test(siga)) continue;
      const price = parsePrice(r["PRECIO OFERTA"]);
      if (!price) continue;

      const brand = cleanBrand(r.MARCA);
      const model = String(r.MODELO || "").trim().toUpperCase();
      const year = parseInt(r["AÑO"], 10) || 2022;
      const color = cleanColor(r.COLOR);
      const prev = existing.get(plate);
      const ph = photos.get(plate);
      const slug = slugify(brand, model, year, plate);

      ready.push({
        slug,
        plate: formatPlate(plate),
        brand,
        model,
        version: `${model} · ${color}`,
        year,
        price,
        listPrice: prev?.listPrice && prev.listPrice > price ? prev.listPrice : undefined,
        km: typeof prev?.km === "number" && prev.km > 0 ? prev.km : 0,
        fuel: fuel(model),
        transmission: transmission(model),
        bodyType: bodyType(model),
        location: "Puerto Montt · Av. El Tepual",
        image: ph?.cover || prev?.image || "/images/placeholder-pending-car.svg",
        gallery: ph?.gallery || prev?.gallery || undefined,
        hasRealPhotos: Boolean(ph?.gallery?.length || (prev?.hasRealPhotos && prev?.image)),
        status: "Disponible",
        engine: prev?.engine || "—",
        power: prev?.power || "—",
        traction: traction(model),
        doors: prev?.doors || (bodyType(model) === "Camioneta" ? 4 : 5),
        owners: prev?.owners || 1,
        featured: false,
        highlights: [
          "Unidad del inventario actual RG Motors",
          "Fotos reales de patio cuando estén disponibles",
        ],
        _sheet: name.trim(),
      });
    }
  }

  const selected = ready.slice(0, LIMIT).map((v, i) => {
    const { _sheet, ...rest } = v;
    return { ...rest, featured: i < 6 };
  });

  return { selected, readyCount: ready.length, photoHits: selected.filter((v) => v.hasRealPhotos).length };
}

function writeVehiclesTs(vehicles) {
  const header = `// Stock importado desde \"total inventario tiempo real.xlsx\" (primeros ${LIMIT} con precio válido)

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
    { label: "Kilometraje", value: \`\${v.km.toLocaleString("es-CL")} km\` },
    { label: "Año", value: String(v.year) },
    { label: "Combustible", value: v.fuel },
    { label: "Transmisión", value: v.transmission },
    { label: "Potencia", value: v.power },
    { label: "Dueños", value: String(v.owners) },
    { label: "Puertas", value: String(v.doors) },
    { label: "Ubicación", value: v.location },
  ];
}

export const BRANDS = [...new Set(vehicles.map((v) => v.brand))].sort();
export const BODY_TYPES = [...new Set(vehicles.map((v) => v.bodyType))];
export const FUELS = [...new Set(vehicles.map((v) => v.fuel))];
export const TRANSMISSIONS = [...new Set(vehicles.map((v) => v.transmission))];
export const STATUS_TYPES = ["Disponible", "En reserva", "Vendido", "Borrador", "En preparación"] as const;
`;

  writeFileSync(join(ROOT, "lib", "vehicles.ts"), header + JSON.stringify(vehicles, null, 2) + footer, "utf8");
}

function main() {
  if (!existsSync(EXCEL)) {
    console.error("No se encontró:", EXCEL);
    process.exit(1);
  }

  const { selected, readyCount, photoHits } = buildVehicles();
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(join(ROOT, "data", "vehicles.json"), JSON.stringify(selected, null, 2), "utf8");
  writeVehiclesTs(selected);

  console.log(`Listas con precio válido (sin FALTA/PREPARACION/vendido): ${readyCount}`);
  console.log(`Cargadas: ${selected.length} (límite ${LIMIT})`);
  console.log(`Con fotos locales: ${photoHits}`);
  console.log("Actualizado: data/vehicles.json + lib/vehicles.ts");
  selected.forEach((v, i) => {
    console.log(
      `${String(i + 1).padStart(2)}. ${v.plate} · ${v.brand} ${v.model} ${v.year} · $${v.price.toLocaleString("es-CL")} · fotos:${v.hasRealPhotos ? "sí" : "no"}`,
    );
  });
}

main();
