/**
 * Vuelve a bajar las fotos de Drive y reemplaza las URLs de Vercel Blob
 * recién cuando la URL nueva quedó guardada en catalog_vehicles.
 *
 * Uso:
 *   npm run photos:resync
 *   npm run photos:resync -- rg-motors
 *   npm run photos:resync -- unidades-chile
 *
 * Lee .env.local / .env antes de importar el sync (hace falta
 * SUPABASE_SERVICE_ROLE_KEY y GOOGLE_DRIVE_*). No borra filas.
 * Los reemplazos manuales (manualReplacedAt) no se pisan: el Blob viejo
 * no se puede leer, hay que volver a subirlos desde el admin.
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
const tenants =
  arg === "rg-motors" || arg === "unidades-chile"
    ? [arg]
    : ["rg-motors", "unidades-chile"];

const { syncDrivePhotosViaOAuth } = await import("../lib/server/driveOAuthSyncService");

for (const tenantSlug of tenants) {
  console.log(`Re-sync ${tenantSlug}`);
  for (let round = 1; round <= 40; round += 1) {
    const result = await syncDrivePhotosViaOAuth({
      tenantSlug,
      migrateBlobUrls: true,
      maxBlobHeadChecks: 0,
      maxNewPhotos: 400,
      maxVehicles: 400,
      photosPerVehicle: 40,
      maxFolderLists: 400,
    });
    const deferred = result.deferredVehicles || 0;
    const downloaded = result.newPhotosDownloaded || 0;
    console.log(
      JSON.stringify({
        tenantSlug,
        round,
        success: result.success,
        syncedVehicles: result.syncedVehicles,
        newPhotosDownloaded: downloaded,
        deferredVehicles: deferred,
        message: result.message,
      }),
    );
    if (!result.success) process.exitCode = 1;
    if (!result.success || (downloaded === 0 && deferred === 0)) break;
  }
}
