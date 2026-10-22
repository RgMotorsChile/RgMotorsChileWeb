/**
 * Genera los 301/410 estáticos a partir del catálogo público de RG.
 * Uso: npx vite-node scripts/build-public-redirects.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicationDecision } from "../lib/vehicles/publication";
import { publicVehicleSlug } from "../lib/vehicles/publicSlug";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  readFileSync(join(root, "lib/vehicles/data/rgCatalog.json"), "utf8"),
) as Array<{ slug: string; brand: string; model: string; version?: string; year: number }>;

const redirects: { source: string; destination: string }[] = [];
const gone: string[] = [];

for (const row of catalog) {
  const vehicle = row;
  const decision = publicationDecision(row.slug, vehicle);
  const next = publicVehicleSlug(vehicle);
  if (decision.type === "gone") {
    gone.push(`/vehiculo/${row.slug}`);
    if (next !== row.slug) gone.push(`/vehiculo/${next}`);
    continue;
  }
  if (decision.type === "redirect") {
    redirects.push({ source: `/vehiculo/${row.slug}`, destination: decision.to });
    continue;
  }
  if (next !== row.slug) {
    redirects.push({ source: `/vehiculo/${row.slug}`, destination: `/vehiculo/${next}` });
  }
}

const payload = {
  redirects,
  gone: [...new Set(gone)],
};

writeFileSync(
  join(root, "lib/vehicles/publicationRedirects.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
);
console.log(`redirects ${payload.redirects.length} gone ${payload.gone.length}`);
