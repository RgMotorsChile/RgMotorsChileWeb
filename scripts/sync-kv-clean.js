const fs = require('fs');
const path = require('path');
console.error("Este script usaba Vercel KV, que ya no está en el proyecto.");
process.exit(1);

// 1. Leer .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      process.env[k] = v;
    }
  }
}

console.log('KV_REST_API_URL:', process.env.KV_REST_API_URL);

async function main() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error('No KV credentials found.');
    return;
  }

  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  // Consultar estado actual
  const currentKv = await kv.get('vehicles.json');
  console.log('Current vehicles in KV:', Array.isArray(currentKv) ? currentKv.length : typeof currentKv);
  if (Array.isArray(currentKv) && currentKv.length > 0) {
    console.log('First 3 in KV:', currentKv.slice(0, 3).map(v => `${v.brand} ${v.model} (${v.image}) [hasRealPhotos: ${v.hasRealPhotos}]`));
  }

  // Leer los 78 vehículos limpios locales
  const cleanVehiclesPath = path.join(__dirname, '..', 'data', 'vehicles.json');
  const cleanVehicles = JSON.parse(fs.readFileSync(cleanVehiclesPath, 'utf8'));
  console.log('Local clean vehicles to upload to KV:', cleanVehicles.length);

  // Asegurar que absolutamente TODOS tengan placeholder y hasRealPhotos = false
  for (const v of cleanVehicles) {
    v.image = '/images/placeholder-pending-car.svg';
    v.gallery = [];
    v.hasRealPhotos = false;
  }

  // Guardar en data/vehicles.json localmente actualizado
  fs.writeFileSync(cleanVehiclesPath, JSON.stringify(cleanVehicles, null, 2), 'utf8');

  // Sobrescribir en Vercel KV (Upstash)
  console.log('Overwriting vehicles.json in Vercel KV...');
  await kv.set('vehicles.json', cleanVehicles);
  console.log('Successfully written to Vercel KV!');

  // Verificar
  const verified = await kv.get('vehicles.json');
  console.log('Verified in KV:', verified.length, 'vehicles.');
  console.log('Sample verified vehicle:', verified[0].brand, verified[0].model, verified[0].image, 'hasRealPhotos:', verified[0].hasRealPhotos);
}

main().catch(console.error);
