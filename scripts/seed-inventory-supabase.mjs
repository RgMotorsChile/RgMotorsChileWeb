/**
 * Genera + aplica seed inventario (InsForge SQL → Supabase, tenant rg-motors).
 *   node scripts/seed-inventory-supabase.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INV = path.join(ROOT, "..", "SistemaInventario RgMotors", "insforge");
const TENANT = "26291b1f-2133-4ea0-8b5e-83765c357771"; // rg-motors

function runSql(file) {
  const r = spawnSync(
    "supabase.cmd",
    ["db", "query", "--linked", "-f", file],
    { cwd: ROOT, encoding: "utf8", shell: true },
  );
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error(`SQL failed: ${file}`);
  }
  if (r.stdout?.trim()) console.log(r.stdout.trim());
}

function transformCategories(src) {
  const names = [...src.matchAll(/\('([^']+)'\)/g)]
    .map((m) => m[1])
    .filter((n) => {
      // only the categories block names (before items insert)
      return true;
    });
  const catBlock = src.slice(
    0,
    src.indexOf("insert into public.items"),
  );
  const catNames = [...catBlock.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
  if (!catNames.length) throw new Error("categories not found");
  const rows = catNames
    .map((n) => `  ('${n.replace(/'/g, "''")}', '${TENANT}'::uuid)`)
    .join(",\n");
  return `
insert into public.categories (name, tenant_id) values
${rows}
on conflict (tenant_id, name) do nothing;
`;
}

function transformItems(src) {
  const start = src.indexOf("insert into public.items");
  const end = src.indexOf("on conflict (sku) do update");
  if (start < 0 || end < 0) throw new Error("items block not found");
  let block = src.slice(start, end);
  block = block.replace(
    "insert into public.items (sku, name, category, brand, stock, min_stock, location, unit_cost, compatible) values",
    `insert into public.items (tenant_id, sku, name, category, brand, stock, min_stock, location, unit_cost, compatible) values`,
  );
  block = block.replace(/\n\s*\('/g, `\n  ('${TENANT}'::uuid, '`);
  return (
    block +
    `
on conflict (tenant_id, sku) do update set
  name = excluded.name,
  category = excluded.category,
  brand = excluded.brand,
  stock = excluded.stock,
  min_stock = excluded.min_stock,
  location = excluded.location,
  compatible = excluded.compatible,
  updated_at = now();
`
  );
}

function transformVehicles(src) {
  let block = src
    .replace(
      "insert into public.vehicles (plate, brand, model, year, color, status) values",
      `insert into public.vehicles (tenant_id, plate, brand, model, year, color, status) values`,
    )
    .replace(/\n\s*\('/g, `\n  ('${TENANT}'::uuid, '`)
    .replace(
      /on conflict \(plate\) do update set[\s\S]*$/i,
      `on conflict (tenant_id, plate_norm) do update set
  brand = excluded.brand,
  model = excluded.model,
  year = excluded.year,
  color = excluded.color,
  status = excluded.status,
  updated_at = now();`,
    );
  return block;
}

const invSheet = fs.readFileSync(path.join(INV, "inventario_sheet.sql"), "utf8");
const vehStock = fs.readFileSync(path.join(INV, "vehicles_stock.sql"), "utf8");

const outDir = path.join(ROOT, "scratch");
fs.mkdirSync(outDir, { recursive: true });

const sql = [
  "-- Seed inventario tenant rg-motors",
  transformCategories(invSheet),
  transformItems(invSheet),
  transformVehicles(vehStock),
  "",
  `select 'categories' as t, count(*)::int as n from public.categories where tenant_id = '${TENANT}'::uuid`,
  `union all select 'items', count(*)::int from public.items where tenant_id = '${TENANT}'::uuid`,
  `union all select 'vehicles', count(*)::int from public.vehicles where tenant_id = '${TENANT}'::uuid;`,
].join("\n");

const out = path.join(outDir, "seed-inventory-rg-motors.sql");
fs.writeFileSync(out, sql);
console.log("Wrote", out, "bytes", sql.length);

runSql(out);
console.log("OK — seed inventario aplicado");
