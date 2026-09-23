/**
 * Migra catálogo a Supabase (catalog_vehicles) por tenant.
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (recomendado) o ANON con policies de write
 *
 * Uso:
 *   node scripts/migrate-catalog-to-supabase.mjs
 *   node scripts/migrate-catalog-to-supabase.mjs --tenant=rg-motors
 *   node scripts/migrate-catalog-to-supabase.mjs --tenant=unidades-chile
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const UC_ROOT = path.join(ROOT, "..", "unidadeschile");

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://tuybpizjeszgwtcvunmp.supabase.co";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

if (!KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY (o anon key).");
  process.exit(1);
}

const sb = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function argTenant() {
  const a = process.argv.find((x) => x.startsWith("--tenant="));
  return a ? a.slice("--tenant=".length) : null;
}

async function getTenantId(slug) {
  const { data, error } = await sb
    .from("tenants")
    .select("id, slug, sheet_tab")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Tenant ${slug} no existe. Aplicá la migración SQL primero.`);
  return data;
}

function mapRgVehicle(v, tenantId) {
  return {
    tenant_id: tenantId,
    slug: v.slug,
    plate: v.plate || null,
    brand: v.brand,
    model: v.model,
    version: v.version || "",
    year: Number(v.year) || 0,
    price: Number(v.price) || 0,
    list_price: v.listPrice != null ? Number(v.listPrice) : null,
    km: Number(v.km) || 0,
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
    doors: Number(v.doors) || 4,
    owners: Number(v.owners) || 1,
    featured: Boolean(v.featured),
    status: v.status || "Disponible",
    has_real_photos: Boolean(v.hasRealPhotos),
    cover_locked: Boolean(v.coverLocked),
    supplier: v.supplier || null,
    tech_review: v.techReview || null,
    circ_permit: v.circPermit || null,
    highlights: v.highlights || [],
    payload: {},
    updated_at: new Date().toISOString(),
  };
}

function mapUcCar(c, tenantId) {
  return {
    tenant_id: tenantId,
    slug: c.id,
    plate: c.unidad || null,
    brand: c.marca,
    model: c.modelo,
    version: c.version || "",
    year: Number(c.year) || 0,
    price: Number(c.precio) || 0,
    list_price: c.mercado != null ? Number(c.mercado) : null,
    km: Number(c.km) || 0,
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
    owners: Number(c.duenos) || 1,
    featured: Boolean(c.destacado),
    status: "Disponible",
    has_real_photos: Array.isArray(c.imagenes) && c.imagenes.length > 0,
    cover_locked: false,
    supplier: null,
    tech_review: null,
    circ_permit: null,
    highlights: c.certificado ? ["Certificado"] : [],
    payload: { source: "unidades-chile-seed" },
    updated_at: new Date().toISOString(),
  };
}

async function loadRgVehicles() {
  // Prefer data/vehicles.json si existe; si no, parsear initialVehicles del TS es frágil.
  const local = path.join(ROOT, "data", "vehicles.json");
  if (fs.existsSync(local)) {
    return JSON.parse(fs.readFileSync(local, "utf8"));
  }
  const kvUrl = process.env.KV_REST_API_URL;
  const kvTok = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvTok) {
    const r = await fetch(`${kvUrl}/get/vehicles.json`, {
      headers: { Authorization: `Bearer ${kvTok}` },
    });
    if (r.ok) {
      const j = await r.json();
      const raw = j.result ?? j;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    }
  }
  console.warn(
    "[rg-motors] Sin data/vehicles.json ni KV — se omite (sync Sheet después).",
  );
  return [];
}

async function loadUcCars() {
  const carsPath = path.join(UC_ROOT, "src", "data", "cars.ts");
  if (!fs.existsSync(carsPath)) {
    console.warn("[unidades-chile] No se encontró src/data/cars.ts");
    return [];
  }
  // Extraer array exportado con eval controlada vía dynamic import no tipado:
  // leemos JSON sibling si existe; si no, pedimos al usuario correr seed desde admin.
  const jsonPath = path.join(UC_ROOT, "scratch", "cars-export.json");
  const alt = path.join(ROOT, "scratch", "uc-cars-export.json");
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }
  if (fs.existsSync(alt)) {
    return JSON.parse(fs.readFileSync(alt, "utf8"));
  }
  // Fallback mínimo: regex de objetos id/unidad/marca (seed parcial no)
  console.warn(
    "[unidades-chile] Exportá cars a scratch/cars-export.json o usá sync Sheet UNIDADES CHILE.",
  );
  return [];
}

async function upsertRows(rows) {
  if (!rows.length) return { count: 0 };
  const chunk = 50;
  let count = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await sb.from("catalog_vehicles").upsert(slice, {
      onConflict: "tenant_id,slug",
    });
    if (error) throw error;
    count += slice.length;
  }
  return { count };
}

async function migrateTenant(slug) {
  const tenant = await getTenantId(slug);
  console.log("Tenant", tenant.slug, "sheet_tab=", tenant.sheet_tab, tenant.id);

  let mapped = [];
  if (slug === "rg-motors") {
    const list = await loadRgVehicles();
    const arr = Array.isArray(list) ? list : list?.vehicles || [];
    mapped = arr.map((v) => mapRgVehicle(v, tenant.id));
  } else if (slug === "unidades-chile") {
    const list = await loadUcCars();
    mapped = list.map((c) => mapUcCar(c, tenant.id));
  }

  const { count } = await upsertRows(mapped);
  console.log(`OK ${slug}: ${count} vehículos en catalog_vehicles`);
}

async function main() {
  const only = argTenant();
  const tenants = only ? [only] : ["rg-motors", "unidades-chile"];
  for (const t of tenants) {
    await migrateTenant(t);
  }
  console.log("Migración catálogo lista.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
