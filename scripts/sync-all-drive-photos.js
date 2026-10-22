const { chromium } = require('@playwright/test');
const https = require('https');
const fs = require('fs');
const path = require('path');
console.error("Este script usaba Vercel KV, que ya no está en el proyecto. El catálogo vive en Supabase.");
process.exit(1);

// Load environment variables from .env.local
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

function downloadImage(fileId, destPath) {
  const url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  
  return new Promise((resolve) => {
    function fetchWithRedirect(u, redirectCount = 0) {
      if (redirectCount > 5) return resolve(false);
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchWithRedirect(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) return resolve(false);

        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          try {
            const st = fs.statSync(destPath);
            if (st.size > 15000) {
              resolve(true);
            } else {
              fs.unlinkSync(destPath);
              resolve(false);
            }
          } catch {
            resolve(false);
          }
        });
        fileStream.on('error', () => {
          try { fs.unlinkSync(destPath); } catch {}
          resolve(false);
        });
      }).on('error', () => resolve(false));
    }

    fetchWithRedirect(url);
  });
}

async function runDriveSync() {
  const driveItems = JSON.parse(fs.readFileSync('scratch/all_drive_folders.json', 'utf8'));
  const vehicles = JSON.parse(fs.readFileSync('data/vehicles.json', 'utf8'));

  const vehicleMap = new Map();
  vehicles.forEach(v => {
    const p = v.plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    vehicleMap.set(p, v);
  });

  // Match folders to vehicles
  const matched = [];
  driveItems.forEach(item => {
    const t = (item.name + ' ' + (item.rawText || '')).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    for (const [plate, v] of vehicleMap.entries()) {
      if (t.includes(plate)) {
        if (!matched.some(m => m.plate === plate)) {
          matched.push({ plate, vehicle: v, folderId: item.id, folderName: item.name });
        }
      }
    }
  });

  console.log(`Matched ${matched.length} vehicles out of ${vehicles.length} in catalog.`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  const vehiclesWithPhotos = [];

  for (let i = 0; i < matched.length; i++) {
    const m = matched[i];
    const slug = m.vehicle.slug;
    const url = `https://drive.google.com/drive/folders/${m.folderId}`;
    console.log(`\n[${i + 1}/${matched.length}] Scanning ${m.plate} (${m.vehicle.brand} ${m.vehicle.model})...`);

    let photos = [];
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      photos = await page.evaluate(() => {
        const list = [];
        const seen = new Set();
        document.querySelectorAll('[data-id]').forEach(el => {
          const id = el.getAttribute('data-id');
          const text = (el.innerText || el.getAttribute('aria-label') || '').trim();
          if (id && !seen.has(id)) {
            if (/\.(heic|jpg|jpeg|png|webp|avif)/i.test(text) || id.length >= 25) {
              seen.add(id);
              list.push({ id, name: text.split('\n')[0] });
            }
          }
        });
        return list;
      });
    } catch (err) {
      console.error(`   Error scanning folder for ${m.plate}:`, err.message);
      continue;
    }

    if (photos.length === 0) {
      console.log(`   No photos found in folder.`);
      continue;
    }

    console.log(`   Found ${photos.length} photos in Drive. Downloading up to 12 photos...`);

    const uploadDir = path.join(__dirname, '..', 'public', 'cars', 'uploads', slug);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const downloadedUrls = [];
    // Take up to 12 photos
    const photosToDownload = photos.slice(0, 12);

    for (let pIdx = 0; pIdx < photosToDownload.length; pIdx++) {
      const p = photosToDownload[pIdx];
      const fileName = `photo-${String(pIdx + 1).padStart(2, '0')}.jpg`;
      const destPath = path.join(uploadDir, fileName);

      // Download if not already existing
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 15000) {
        const ok = await downloadImage(p.id, destPath);
        if (ok) {
          downloadedUrls.push(`/cars/uploads/${slug}/${fileName}`);
        }
      } else {
        downloadedUrls.push(`/cars/uploads/${slug}/${fileName}`);
      }
    }

    if (downloadedUrls.length > 0) {
      console.log(`   ✅ Successfully prepared ${downloadedUrls.length} photos for ${m.plate}`);
      m.vehicle.image = downloadedUrls[0];
      m.vehicle.gallery = downloadedUrls;
      m.vehicle.hasRealPhotos = true;
      vehiclesWithPhotos.push(m.plate);
    }
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`Photos synced for ${vehiclesWithPhotos.length} vehicles!`);
  console.log(`========================================`);

  // Save updated vehicles.json
  fs.writeFileSync('data/vehicles.json', JSON.stringify(vehicles, null, 2), 'utf8');
  console.log('Saved updated data/vehicles.json');

  // Regenerate lib/vehicles.ts
  const tsContent = `// 100% Authentic RG Motors Stock from Excel Inventory (RG MOTORS + UNIDADES CHILE)
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

export const initialVehicles: Vehicle[] = ${JSON.stringify(vehicles, null, 2)};

export const HERO_SHOWCASE_VEHICLES: Vehicle[] = initialVehicles
  .filter((v) => v.brand === "Toyota" || v.brand === "Mitsubishi")
  .slice(0, 6);

export const vehicles: Vehicle[] = initialVehicles;

export function getVehicle(slug: string): Vehicle | undefined {
  return vehicles.find((v) => v.slug === slug);
}

export function formatCLP(amount: number): string {
  if (!amount || amount <= 0) return "Consultar precio";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatKm(km: number): string {
  return new Intl.NumberFormat("es-CL").format(km) + " km";
}

export function estimateMonthly(price: number, termMonths = 48, piePercent = 0.2): number {
  if (!price || price <= 0) return 0;
  const financed = price * (1 - piePercent);
  const monthlyRate = 0.0129; // ~1.29% mensual
  const factor = (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(financed * factor);
}

export function spinFramesOf(v: Vehicle): string[] {
  if (!v.spin || v.spin.count <= 0) return [];
  const { count, pattern = "" } = v.spin;
  return Array.from({ length: count }, (_, i) =>
    pattern ? pattern.replace("{index}", String(i + 1).padStart(3, "0")) : ""
  ).filter(Boolean);
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

export const BRANDS = [
  "Toyota",
  "Mitsubishi",
  "Chevrolet",
  "Nissan",
  "Great Wall",
  "Peugeot",
  "Fiat",
  "Hyundai",
  "Subaru",
  "Renault",
  "DFSK",
  "Mercedes-Benz",
  "Ford",
  "Volkswagen",
  "Kia",
  "Suzuki",
  "Maxus",
  "MG",
  "SsangYong",
  "Omoda",
  "Changan",
  "Hino",
  "RAM",
  "JAC",
  "Chery",
  "Otro",
];

export const BODY_TYPES = [
  "Pickup",
  "SUV",
  "Furgón",
  "Sedán",
  "Hatchback",
  "Camión",
  "Station Wagon",
  "Otro",
];

export const FUELS = ["Diésel", "Bencina", "Híbrido", "Eléctrico"];

export const TRANSMISSIONS = ["Automática", "Manual"];

export const STATUS_TYPES = ["Disponible", "En reserva", "Vendido", "Borrador", "En preparación"] as const;
`;

  fs.writeFileSync('lib/vehicles.ts', tsContent, 'utf8');
  console.log('Saved updated lib/vehicles.ts');

  // Sync to Vercel KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    console.log('Writing updated inventory to Vercel KV (Upstash)...');
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    await kv.set('vehicles.json', vehicles);
    console.log('Successfully synced to Vercel KV!');
  } else {
    console.log('No KV credentials found, skipping KV write.');
  }
}

runDriveSync().catch(console.error);
