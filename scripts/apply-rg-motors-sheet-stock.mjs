/**
 * Aplica el stock RG Motors (planilla 9-sep-2026) sobre KV + data/vehicles.json.
 * Conserva fotos/galería existentes. No escribe ni borra carpetas de Google Drive.
 *
 *   node --env-file=.env.local scripts/apply-rg-motors-sheet-stock.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@vercel/kv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PLACEHOLDER = "/images/placeholder-pending-car.svg";

function cleanPlate(p) {
  return String(p || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function formatPlate(p) {
  const c = cleanPlate(p);
  if (c.length === 6) return `${c.slice(0, 4)} ${c.slice(4)}`;
  return c;
}

function slugify(brand, model, year, plate) {
  return `${brand}-${model}-${year}-${cleanPlate(plate)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function guessBody(model) {
  const m = model.toUpperCase();
  if (/RAIZE|WRX|ML300/.test(m)) return "SUV";
  if (/PARTNER|EXPERT/.test(m)) return "Furgón";
  if (/XZU|PORTER/.test(m)) return "Camión";
  return "Camioneta";
}

function tractionOf(model) {
  const m = model.toUpperCase();
  if (m.includes("4X4")) return "4x4";
  if (m.includes("4X2")) return "4x2";
  return "Por confirmar";
}

/** Oferta + lista. price=0 → sin precio publicado. reserved → En reserva. */
const STOCK = [
  { plate: "KWRC91", brand: "Mitsubishi", model: "NEW KATANA CRT 4X2", color: "Rojo", year: 2019, price: 9990000, listPrice: 10990000, km: 389144 },
  { plate: "RBFK40", brand: "Mitsubishi", model: "L200 KATANA 4X2", color: "Rojo", year: 2021, price: 11990000, listPrice: 12990000, km: 182825 },
  { plate: "PGBV10", brand: "Mitsubishi", model: "L200 KATANA 4X4", color: "Rojo", year: 2020, price: 12490000, listPrice: 13990000, km: 208401 },
  { plate: "PXSV97", brand: "Mitsubishi", model: "L200 WORK 4X2", color: "Rojo", year: 2021, price: 12490000, listPrice: 13490000, km: 139113 },
  { plate: "PKGF78", brand: "Mitsubishi", model: "NEW KATANA 4X4", color: "Rojo", year: 2021, price: 13490000, listPrice: 14490000, km: 203454 },
  { plate: "SGVC26", brand: "Mitsubishi", model: "KATANA 4X4", color: "Rojo", year: 2023, price: 0, listPrice: 0, km: 231741, prep: true },
  { plate: "THZF75", brand: "Mitsubishi", model: "KATANA 4X2", color: "Rojo", year: 2024, price: 14990000, listPrice: 15990000, km: 65000 },
  { plate: "THLV62", brand: "Mitsubishi", model: "L200 KATANA 4X2", color: "Rojo", year: 2024, price: 14990000, listPrice: 15990000, km: 69749 },
  { plate: "TSGL82", brand: "Toyota", model: "RAIZE 4X2 1.2", color: "Gris", year: 2025, price: 11990000, listPrice: 13490000, km: 16000 },
  { plate: "PSKJ78", brand: "Toyota", model: "HILUX DX 4X4", color: "Rojo", year: 2021, price: 14990000, listPrice: 15990000, km: 265752 },
  { plate: "SWDV33", brand: "Toyota", model: "HILUX 4X2", color: "Rojo", year: 2023, price: 15990000, listPrice: 16990000, km: 159378 },
  { plate: "RZVL18", brand: "Toyota", model: "HILUX 4X4", color: "Rojo", year: 2022, price: 16990000, listPrice: 17990000, km: 127576 },
  { plate: "RWYR12", brand: "Toyota", model: "HILUX SR 4X4", color: "Rojo", year: 2022, price: 22990000, listPrice: 23990000, km: 84000 },
  { plate: "SWZJ94", brand: "Toyota", model: "HILUX SR", color: "Rojo", year: 2023, price: 0, listPrice: 0, km: 0, prep: true },
  { plate: "THSR65", brand: "Toyota", model: "HILUX SR 4X4", color: "Rojo", year: 2024, price: 24990000, listPrice: 25990000, km: 90386 },
  { plate: "RLVR63", brand: "Peugeot", model: "PARTNER", color: "Blanco", year: 2022, price: 7990000, listPrice: 8990000, km: 246000 },
  { plate: "SBZC70", brand: "Peugeot", model: "PARTNER HDI 92 L1 1.6", color: "Blanco", year: 2022, price: 8290000, listPrice: 9290000, km: 150104 },
  { plate: "PSJJ97", brand: "Peugeot", model: "PARTNER", color: "Blanco", year: 2021, price: 8990000, listPrice: 10490000, km: 104900 },
  { plate: "SSDD57", brand: "Peugeot", model: "PARTNER", color: "Blanco", year: 2023, price: 9990000, listPrice: 10990000, km: 152557 },
  { plate: "SVFB26", brand: "Peugeot", model: "PARTNER 1.5", color: "Blanco", year: 2023, price: 10490000, listPrice: 11490000, km: 89498 },
  { plate: "SCDW37", brand: "Peugeot", model: "EXPERT", color: "Blanco", year: 2022, price: 10990000, listPrice: 11990000, km: 236400 },
  { plate: "TCGB98", brand: "Nissan", model: "NAVARA XE 4X2", color: "Rojo", year: 2024, price: 15990000, listPrice: 17990000, km: 125518 },
  { plate: "TCPT20", brand: "Nissan", model: "NAVARA 4X2", color: "Rojo", year: 2024, price: 15990000, listPrice: 17990000, km: 51714 },
  { plate: "LXTX71", brand: "Nissan", model: "NP300 NAVARA DCAB 2.3", color: "Rojo", year: 2020, price: 11990000, listPrice: 11990000, km: 183860, reserved: true },
  { plate: "LRJY32", brand: "Ford", model: "RAPTOR F150", color: "Rojo", year: 2020, price: 39990000, listPrice: 39990000, km: 136279 },
  { plate: "SFRX48", brand: "Volkswagen", model: "SAVEIRO DCAB", color: "Blanco", year: 2023, price: 9990000, listPrice: 10990000, km: 59000 },
  { plate: "SLGD85", brand: "Volkswagen", model: "SAVEIRO CD 1.6", color: "Blanco", year: 2022, price: 9990000, listPrice: 10990000, km: 8065 },
  { plate: "RRKB78", brand: "Volkswagen", model: "AMAROK 4X4 MT", color: "Blanco", year: 2022, price: 14990000, listPrice: 15990000, km: 207000 },
  { plate: "SKLF13", brand: "Hino", model: "XZU 617 DC", color: "Blanco", year: 2023, price: 25990000, listPrice: 26990000, km: 103000 },
  { plate: "SDDS52", brand: "Maxus", model: "T60 4X4 GLX", color: "Blanco", year: 2022, price: 10990000, listPrice: 11990000, km: 190305 },
  { plate: "SFWD31", brand: "Maxus", model: "T60 4X2", color: "Blanco", year: 2022, price: 9990000, listPrice: 10990000, km: 69379 },
  { plate: "STPZ87", brand: "Maxus", model: "T60 4X2 AT", color: "Gris", year: 2023, price: 12990000, listPrice: 14990000, km: 78000 },
  { plate: "SFYB29", brand: "Chevrolet", model: "COLORADO 4X4 AUT.", color: "Blanco", year: 2022, price: 18990000, listPrice: 19990000, km: 111222 },
  { plate: "SFBL43", brand: "Chevrolet", model: "COLORADO 4X4 AUT.", color: "Blanco", year: 2022, price: 16990000, listPrice: 17990000, km: 149586 },
  { plate: "SDJT43", brand: "Chevrolet", model: "COLORADO 4X4 AUT.", color: "Blanco", year: 2022, price: 15990000, listPrice: 16990000, km: 177865 },
  { plate: "DDLJ95", brand: "Mercedes-Benz", model: "ML300 CDI", color: "Blanco", year: 2011, price: 9490000, listPrice: 10490000, km: 216000 },
  { plate: "RKRG58", brand: "Subaru", model: "WRX STI 4X4 2.5", color: "Azul", year: 2022, price: 39990000, listPrice: 40990000, km: 0 },
];

function indexByPlate(list) {
  const map = new Map();
  for (const v of list || []) {
    const p = cleanPlate(v.plate);
    if (p) map.set(p, v);
  }
  return map;
}

function localGallery(slug) {
  const dir = path.join(ROOT, "public", "cars", "uploads", slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => `/cars/uploads/${slug}/${f}`);
}

function respaldoGallery(plate, slug) {
  const root = path.join(ROOT, "RESPALDO_FOTOS_DRIVE");
  if (!fs.existsSync(root)) return [];
  const needle = cleanPlate(plate);
  const folder = fs.readdirSync(root).find((name) => cleanPlate(name).includes(needle));
  if (!folder) return [];
  const dir = path.join(root, folder);
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!files.length) return [];
  const dest = path.join(ROOT, "public", "cars", "uploads", slug);
  fs.mkdirSync(dest, { recursive: true });
  const urls = [];
  files.forEach((f, i) => {
    const ext = path.extname(f).toLowerCase() === ".jpeg" ? ".jpg" : path.extname(f).toLowerCase();
    const name = `photo-${String(i + 1).padStart(2, "0")}${ext || ".jpg"}`;
    const target = path.join(dest, name);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(dir, f), target);
    }
    urls.push(`/cars/uploads/${slug}/${name}`);
  });
  return urls;
}

function hasUsablePhotos(v) {
  const g = Array.isArray(v.gallery) ? v.gallery : [];
  return Boolean(
    v.hasRealPhotos ||
      (v.image && !String(v.image).includes("placeholder")) ||
      g.length > 0,
  );
}

function mergeVehicle(row, existing) {
  const plate = formatPlate(row.plate);
  const slug = existing?.slug || slugify(row.brand, row.model, row.year, row.plate);
  const status = row.prep ? "En preparación" : row.reserved ? "En reserva" : "Disponible";

  let gallery = Array.isArray(existing?.gallery) ? [...existing.gallery] : [];
  let image = existing?.image || PLACEHOLDER;

  if (!hasUsablePhotos({ ...existing, gallery, image })) {
    const fromUploads = localGallery(slug);
    const fromRespaldo = fromUploads.length ? [] : respaldoGallery(row.plate, slug);
    const found = fromUploads.length ? fromUploads : fromRespaldo;
    if (found.length) {
      gallery = found;
      image = found[0];
    } else {
      gallery = [];
      image = PLACEHOLDER;
    }
  }

  const featured = row.brand === "Toyota" || row.brand === "Mitsubishi";
  const base = existing || {};

  return {
    ...base,
    slug,
    plate,
    brand: row.brand,
    model: row.model,
    version: `${row.model} · ${row.color}`,
    year: row.year,
    price: row.price,
    listPrice: row.listPrice > row.price ? row.listPrice : row.listPrice || undefined,
    km: row.km || base.km || 0,
    fuel: base.fuel && base.fuel !== "Por confirmar" ? base.fuel : "Por confirmar",
    transmission:
      base.transmission && base.transmission !== "Por confirmar"
        ? base.transmission
        : "Por confirmar",
    bodyType:
      base.bodyType && base.bodyType !== "Pickup"
        ? base.bodyType === "Camioneta"
          ? "Camioneta"
          : base.bodyType
        : guessBody(row.model),
    location: "Puerto Montt · Av. El Tepual",
    image,
    gallery,
    hasRealPhotos: hasUsablePhotos({ image, gallery }),
    supplier: base.supplier || "RG Motors",
    status,
    engine: base.engine || "Por confirmar",
    power: base.power || "Por confirmar",
    traction: base.traction && base.traction !== "Por confirmar" ? base.traction : tractionOf(row.model),
    doors: base.doors || 4,
    owners: base.owners || 1,
    featured,
    spin: base.spin,
    techReview: base.techReview,
    circPermit: base.circPermit,
    highlights: [
      "Unidad del inventario RG Motors",
      "Fotos reales de patio cuando estén disponibles",
    ],
  };
}

async function main() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error("Faltan credenciales KV");
    process.exit(1);
  }

  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const kvList = (await kv.get("vehicles.json")) || [];
  const localList = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "vehicles.json"), "utf8"));
  const kvMap = indexByPlate(kvList);
  const localMap = indexByPlate(localList);

  const wanted = new Set(STOCK.map((s) => s.plate));
  const next = [];
  const created = [];
  const updated = [];

  for (const row of STOCK) {
    const existing = kvMap.get(row.plate) || localMap.get(row.plate) || null;
    if (!existing) created.push(row.plate);
    else updated.push(row.plate);
    next.push(mergeVehicle(row, existing));
  }

  next.sort((a, b) => {
    const aTop = (a.brand === "Toyota" || a.brand === "Mitsubishi") && a.price > 0;
    const bTop = (b.brand === "Toyota" || b.brand === "Mitsubishi") && b.price > 0;
    if (aTop && !bTop) return -1;
    if (!aTop && bTop) return 1;
    return (b.price || 0) - (a.price || 0);
  });

  const archived = [];
  const soldPrev = (await kv.get("sold_vehicles.json")) || [];
  const sold = Array.isArray(soldPrev) ? [...soldPrev] : [];
  for (const v of kvList) {
    const p = cleanPlate(v.plate);
    if (!wanted.has(p)) {
      archived.push(p);
      sold.unshift({
        id: `sold-${v.slug}-${Date.now()}`,
        slug: v.slug,
        plate: v.plate || p,
        brand: v.brand,
        model: v.model,
        version: v.version,
        year: v.year,
        salePrice: v.price,
        listPrice: v.listPrice,
        km: v.km,
        fuel: v.fuel,
        transmission: v.transmission,
        bodyType: v.bodyType,
        location: v.location,
        supplier: v.supplier,
        soldAt: new Date().toISOString(),
        status: "Vendido",
        notes: "Retirado al acotar catálogo a planilla RG Motors (no se tocó Google Drive)",
      });
    }
  }

  const outPath = path.join(ROOT, "data", "vehicles.json");
  fs.writeFileSync(outPath, JSON.stringify(next, null, 2), "utf8");
  await kv.set("vehicles.json", next);
  await kv.set("sold_vehicles.json", sold);

  console.log(
    JSON.stringify(
      {
        active: next.length,
        created,
        archived,
        withPhotos: next.filter((v) => v.hasRealPhotos).length,
        prep: next.filter((v) => v.status === "En preparación").map((v) => v.plate),
        reserved: next.filter((v) => v.status === "En reserva").map((v) => v.plate),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
