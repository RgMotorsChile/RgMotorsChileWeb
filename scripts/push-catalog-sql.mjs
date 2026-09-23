/**
 * Upsert catálogo → Supabase via `supabase db query` (rol link, sin service_role).
 *   node scripts/push-catalog-sql.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const UC_JSON = path.join(ROOT, "scratch", "uc-cars-export.json");
const TENANTS = {
  "rg-motors": "26291b1f-2133-4ea0-8b5e-83765c357771",
  "unidades-chile": "68511b95-6a9e-4f18-a5b7-11a0a1d9a6c1",
};

function esc(s) {
  if (s == null) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}
function num(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : "0";
}
function bool(b) {
  return b ? "true" : "false";
}
function jsonb(v) {
  return `${esc(JSON.stringify(v ?? null))}::jsonb`;
}

function sqlUpsert(row) {
  return `
insert into public.catalog_vehicles (
  tenant_id, slug, plate, brand, model, version, year, price, list_price, km,
  fuel, transmission, body_type, location, image, gallery, spin, engine, power,
  traction, doors, owners, featured, status, has_real_photos, cover_locked,
  supplier, tech_review, circ_permit, highlights, payload, updated_at
) values (
  '${row.tenant_id}'::uuid, ${esc(row.slug)}, ${esc(row.plate)}, ${esc(row.brand)},
  ${esc(row.model)}, ${esc(row.version)}, ${num(row.year)}, ${num(row.price)},
  ${row.list_price == null ? "NULL" : num(row.list_price)}, ${num(row.km)},
  ${esc(row.fuel)}, ${esc(row.transmission)}, ${esc(row.body_type)}, ${esc(row.location)},
  ${esc(row.image)}, ${jsonb(row.gallery)}, ${row.spin ? jsonb(row.spin) : "NULL"},
  ${esc(row.engine)}, ${esc(row.power)}, ${esc(row.traction)}, ${num(row.doors)},
  ${num(row.owners)}, ${bool(row.featured)}, ${esc(row.status)},
  ${bool(row.has_real_photos)}, ${bool(row.cover_locked)},
  ${esc(row.supplier)}, ${esc(row.tech_review)}, ${esc(row.circ_permit)},
  ${jsonb(row.highlights)}, ${jsonb(row.payload)}, now()
)
on conflict (tenant_id, slug) do update set
  plate = excluded.plate, brand = excluded.brand, model = excluded.model,
  version = excluded.version, year = excluded.year, price = excluded.price,
  list_price = excluded.list_price, km = excluded.km, fuel = excluded.fuel,
  transmission = excluded.transmission, body_type = excluded.body_type,
  location = excluded.location, image = excluded.image, gallery = excluded.gallery,
  spin = excluded.spin, engine = excluded.engine, power = excluded.power,
  traction = excluded.traction, doors = excluded.doors, owners = excluded.owners,
  featured = excluded.featured, status = excluded.status,
  has_real_photos = excluded.has_real_photos, cover_locked = excluded.cover_locked,
  supplier = excluded.supplier, tech_review = excluded.tech_review,
  circ_permit = excluded.circ_permit, highlights = excluded.highlights,
  payload = excluded.payload, updated_at = now();`;
}

function mapRg(v) {
  return {
    tenant_id: TENANTS["rg-motors"],
    slug: v.slug,
    plate: v.plate || null,
    brand: v.brand,
    model: v.model,
    version: v.version || "",
    year: v.year,
    price: v.price,
    list_price: v.listPrice ?? null,
    km: v.km,
    fuel: v.fuel || "",
    transmission: v.transmission || "",
    body_type: v.bodyType || "",
    location: v.location || "",
    image: v.image || "",
    gallery: v.gallery || [],
    spin: v.spin || null,
    engine: v.engine || "",
    power: v.power || "",
    traction: v.traction || "",
    doors: v.doors ?? 4,
    owners: v.owners ?? 1,
    featured: !!v.featured,
    status: v.status || "Disponible",
    has_real_photos: !!v.hasRealPhotos,
    cover_locked: !!v.coverLocked,
    supplier: v.supplier || null,
    tech_review: v.techReview || null,
    circ_permit: v.circPermit || null,
    highlights: v.highlights || [],
    payload: {},
  };
}

function mapUc(c) {
  return {
    tenant_id: TENANTS["unidades-chile"],
    slug: c.id,
    plate: c.unidad || null,
    brand: c.marca,
    model: c.modelo,
    version: c.version || "",
    year: c.year,
    price: c.precio,
    list_price: c.mercado ?? null,
    km: c.km,
    fuel: c.combustible || "",
    transmission: c.transmision || "",
    body_type: c.carroceria || "",
    location: c.ciudad || "Puerto Montt",
    image: (c.imagenes && c.imagenes[0]) || "",
    gallery: c.imagenes || [],
    spin: null,
    engine: "",
    power: "",
    traction: c.traccion || "",
    doors: 4,
    owners: c.duenos ?? 1,
    featured: !!c.destacado,
    status: "Disponible",
    has_real_photos: Array.isArray(c.imagenes) && c.imagenes.length > 0,
    cover_locked: false,
    supplier: null,
    tech_review: null,
    circ_permit: null,
    highlights: c.certificado ? ["Certificado"] : [],
    payload: { source: "unidades-chile-seed" },
  };
}

async function loadRgFromKv() {
  // Cargar .env.local manualmente
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
      }
    }
  }
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return [];
  const r = await fetch(`${url}/get/vehicles.json`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (!r.ok) {
    console.warn("KV get failed", r.status);
    return [];
  }
  const j = await r.json();
  let raw = j.result ?? j;
  if (typeof raw === "string") raw = JSON.parse(raw);
  return Array.isArray(raw) ? raw : [];
}

async function main() {
  const rg = await loadRgFromKv();
  console.log("RG vehicles from KV:", rg.length);

  const uc = fs.existsSync(UC_JSON)
    ? JSON.parse(fs.readFileSync(UC_JSON, "utf8"))
    : [];
  console.log("UC vehicles from export:", uc.length);

  const rows = [...rg.map(mapRg), ...uc.map(mapUc)];
  if (!rows.length) {
    console.error("Nada que migrar");
    process.exit(1);
  }

  // Ejecutar en lotes para no saturar el CLI
  const BATCH = 15;
  let ok = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const sql = slice.map(sqlUpsert).join("\n");
    const tmp = path.join(ROOT, "scratch", `_batch_${i}.sql`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, sql);
    const r = spawnSync(
      "supabase.cmd",
      ["db", "query", "--linked", "-f", tmp],
      { cwd: ROOT, encoding: "utf8", shell: true },
    );
    if (r.status !== 0) {
      console.error("stdout:", r.stdout);
      console.error("stderr:", r.stderr);
      process.exit(r.status || 1);
    }
    ok += slice.length;
    console.log(`Upserted ${ok}/${rows.length}`);
  }
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
