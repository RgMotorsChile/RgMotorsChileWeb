/**
 * Vuelve a bajar las fotos de Drive y reemplaza las URLs de Vercel Blob
 * recién cuando la URL nueva quedó guardada en catalog_vehicles.
 *
 * En producción no hace falta este script: GitHub Actions → "Re-sync fotos"
 * llama a /api/cron/photos-resync con el CRON_SECRET que ya está en Vercel.
 *
 * Uso local (hace falta .env.local con SUPABASE_SERVICE_ROLE_KEY y GOOGLE_DRIVE_*):
 *   npm run photos:resync
 *   npm run photos:resync -- rg-motors
 *   npm run photos:resync -- unidades-chile
 *
 * No borra filas. Los reemplazos manuales (manualReplacedAt) no se pisan.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const arg = process.argv[2];
const onlyTenant = arg === "rg-motors" || arg === "unidades-chile" ? arg : undefined;

const { runPhotosResyncBatch } = await import("../lib/server/photosResync");

let cursor: string | null = onlyTenant ?? null;
for (let round = 1; round <= 160; round += 1) {
  const result = await runPhotosResyncBatch({
    cursor,
    limit: 8,
    deadlineAt: Number.POSITIVE_INFINITY,
    stopAfterTenant: onlyTenant,
  });
  console.log(JSON.stringify({ round, ...result }));
  if (!result.ok) process.exitCode = 1;
  if (!result.ok || result.done || !result.nextCursor) break;
  if (
    result.nextCursor === cursor &&
    result.newPhotosDownloaded === 0 &&
    result.deferredVehicles === 0
  ) {
    process.exitCode = 1;
    break;
  }
  cursor = result.nextCursor;
}
