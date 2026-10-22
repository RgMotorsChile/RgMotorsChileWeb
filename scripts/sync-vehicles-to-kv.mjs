/**
 * Sube data/vehicles.json al KV de Vercel (reemplaza el stock remoto).
 * Uso: node scripts/sync-vehicles-to-kv.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

console.error(
  "Este script usaba Vercel KV, que ya no está en el proyecto. El catálogo vive en Supabase (catalog_vehicles).",
);
process.exit(1);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) {
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error("Faltan credenciales KV en .env.local");
    process.exit(1);
  }

  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const localPath = path.join(ROOT, "data", "vehicles.json");
  const local = JSON.parse(fs.readFileSync(localPath, "utf8"));
  if (!Array.isArray(local) || local.length === 0) {
    console.error("data/vehicles.json vacío o inválido");
    process.exit(1);
  }

  const before = await kv.get("vehicles.json");
  console.log("KV antes:", Array.isArray(before) ? before.length : typeof before);
  console.log("Local a subir:", local.length);

  await kv.set("vehicles.json", local);
  const after = await kv.get("vehicles.json");
  console.log("KV después:", Array.isArray(after) ? after.length : typeof after);
  console.log("OK — inventario sincronizado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
