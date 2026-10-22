const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');
console.error("Este script usaba Vercel KV, que ya no está en el proyecto. El stock se sincroniza hacia Supabase.");
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

const SHEET_ID = '1BG2uR6APbXEMvVvRmdR-Nn0Vko6eobJ6Xam0XX41Ldc';
const exportUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

function fetchBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Demasiadas redirecciones'));

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchBuffer(res.headers.location, redirectCount + 1));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        resolve({ buffer: Buffer.concat(chunks), statusCode: res.statusCode || 200 });
      });
      res.on('error', reject);
    });
  });
}

function cleanPlate(p) {
  if (!p) return '';
  return String(p).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function cleanBrand(b) {
  if (!b) return 'Otro';
  const s = String(b).trim().toUpperCase();
  const map = {
    MITSUBISHI: 'Mitsubishi',
    TOYOTA: 'Toyota',
    PEUGEOT: 'Peugeot',
    NISSAN: 'Nissan',
    CHEVROLET: 'Chevrolet',
    FORD: 'Ford',
    VOLKSWAGEN: 'Volkswagen',
    VOLSWAGEN: 'Volkswagen',
    MAXUS: 'Maxus',
    MG: 'MG',
    SSANGYONG: 'SsangYong',
    SSANYONG: 'SsangYong',
    HYUNDAI: 'Hyundai',
    RENAULT: 'Renault',
    MERCEDEZ: 'Mercedes-Benz',
    'MERCEDES-BENZ': 'Mercedes-Benz',
    SUBARU: 'Subaru',
    OMODA: 'Omoda',
    CHANGAN: 'Changan',
    HINO: 'Hino',
    RAM: 'RAM',
    JAC: 'JAC',
    FIAT: 'Fiat',
    CHERY: 'Chery',
    SUZUKI: 'Suzuki',
    KIA: 'Kia',
  };
  return map[s] || s.charAt(0) + s.slice(1).toLowerCase();
}

function parsePrice(rawOffer, rawList) {
  function getNum(s) {
    if (!s) return 0;
    const str = String(s);
    if (/falta|reservado|preparacion|terminar|taller|casa|consignado|rq|fotos|vendido|entregado/i.test(str)) return 0;
    const clean = str.replace(/[^0-9]/g, '');
    if (!clean) return 0;
    let n = parseInt(clean, 10);
    if (n > 100000000) n = Math.round(n / 100);
    return n;
  }
  const offer = getNum(rawOffer);
  const list = getNum(rawList);
  if (offer > 0) return { price: offer, listPrice: list > offer ? list : undefined };
  if (list > 0) return { price: list, listPrice: undefined };
  return { price: 0, listPrice: undefined };
}

function parseKm(raw) {
  if (!raw) return 0;
  const str = String(raw);
  if (/falta|consignado|ald|c\.poder|rq|fotos|en revision/i.test(str)) return 0;
  const kmPart = str.split(/km/i)[0];
  const clean = (kmPart || str).replace(/[^0-9]/g, '');
  return clean ? parseInt(clean, 10) : 0;
}

async function main() {
  console.log(`[Sync] Conectando a Google Sheets (${SHEET_ID})...`);

  const res = await fetchBuffer(exportUrl);
  const head = res.buffer.slice(0, 100).toString('utf8');
  if (res.statusCode === 401 || head.includes('<!DOCTYPE') || head.includes('<html')) {
    console.error('\n⚠️ ACCESO RESTRINGIDO EN GOOGLE SHEETS');
    console.error('La hoja actual requiere inicio de sesión en Google.');
    console.error('👉 Para habilitar la lectura automática continua:');
    console.error('1. Abre https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit');
    console.error('2. Haz clic en "Compartir" (arriba a la derecha).');
    console.error('3. En "Acceso general", cambia "Restringido" a "Cualquier persona que tenga el vínculo" en modo LECTOR.');
    console.error('4. Guarda y vuelve a ejecutar este script.\n');
    return;
  }

  console.log('✅ Archivo XLSX descargado con éxito.');
  const workbook = XLSX.read(res.buffer, { type: 'buffer' });

  const currentVehicles = JSON.parse(fs.readFileSync('data/vehicles.json', 'utf8'));
  let soldArchive = [];
  if (fs.existsSync('data/sold_vehicles.json')) {
    soldArchive = JSON.parse(fs.readFileSync('data/sold_vehicles.json', 'utf8'));
  }

  const currentPlateMap = new Map();
  currentVehicles.forEach(v => {
    currentPlateMap.set(cleanPlate(v.plate), v);
  });

  const sheetVehicles = [];

  for (const name of workbook.SheetNames) {
    const norm = name.trim().toUpperCase();
    if (norm !== "RG MOTORS" && norm !== "UNIDADES CHILE") {
      continue;
    }
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 3) continue;

      const cleanP = cleanPlate(r[1]);
      if (cleanP.length !== 6 || !/[A-Z]{2,4}[0-9]{2,4}/.test(cleanP)) continue;

      const rawText = r.join(' ').toUpperCase();
      const isSold = rawText.includes('VENDIDO') || rawText.includes('ENTREGADO') || rawText.includes('VTA');
      const { price, listPrice } = parsePrice(r[7], r[6]);

      sheetVehicles.push({
        plate: cleanP,
        brand: cleanBrand(r[2]),
        model: String(r[3] || '').trim().toUpperCase(),
        color: String(r[4] || '').trim(),
        year: parseInt(String(r[5]), 10) || 2022,
        price,
        listPrice,
        km: parseKm(r[8]),
        supplier: String(r[9] || '').trim(),
        isSold,
      });
    }
  }

  console.log(`Leídos ${sheetVehicles.length} vehículos desde Google Sheets.`);

  const activeSheetPlates = new Set();
  let newCount = 0;
  let updatedCount = 0;
  let soldCount = 0;
  const updatedActiveList = [];

  for (const item of sheetVehicles) {
    activeSheetPlates.add(item.plate);

    if (item.isSold) {
      if (currentPlateMap.has(item.plate)) {
        const existing = currentPlateMap.get(item.plate);
        soldArchive.push({
          id: `sold-${existing.slug}-${Date.now()}`,
          slug: existing.slug,
          plate: existing.plate,
          brand: existing.brand,
          model: existing.model,
          year: existing.year,
          salePrice: item.price || existing.price,
          km: existing.km,
          soldAt: new Date().toISOString(),
          status: 'Vendido',
        });
        soldCount++;
        // Delete uploaded photos to save space
        const pDir = path.join('public', 'cars', 'uploads', existing.slug);
        if (fs.existsSync(pDir)) {
          fs.rmSync(pDir, { recursive: true, force: true });
        }
      }
      continue;
    }

    if (currentPlateMap.has(item.plate)) {
      const existing = currentPlateMap.get(item.plate);
      if (item.price > 0 && item.price !== existing.price) {
        existing.price = item.price;
        updatedCount++;
      }
      if (item.km > 0 && item.km !== existing.km) {
        existing.km = item.km;
        updatedCount++;
      }
      updatedActiveList.push(existing);
    } else {
      const formattedPlate = `${item.plate.slice(0, 4)} ${item.plate.slice(4)}`;
      const slug = `${item.brand.toLowerCase()}-${item.model.toLowerCase()}-${item.year}-${item.plate.toLowerCase()}`
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      updatedActiveList.push({
        slug,
        plate: formattedPlate,
        brand: item.brand,
        model: item.model,
        version: `${item.model} · ${item.color}`,
        year: item.year,
        price: item.price,
        listPrice: item.listPrice,
        km: item.km,
        fuel: 'Diésel',
        transmission: 'Manual',
        bodyType: 'Pickup',
        location: 'Puerto Montt · Av. El Tepual',
        image: '/images/placeholder-pending-car.svg',
        gallery: [],
        hasRealPhotos: false,
        status: 'Disponible',
        engine: '2.4L',
        power: '150 HP',
        traction: '4x4',
        doors: 4,
        owners: 1,
        featured: item.brand === 'Toyota' || item.brand === 'Mitsubishi',
      });
      newCount++;
    }
  }

  // Check removed vehicles
  for (const [plate, existing] of currentPlateMap.entries()) {
    if (!activeSheetPlates.has(plate)) {
      soldArchive.push({
        id: `sold-${existing.slug}-${Date.now()}`,
        slug: existing.slug,
        plate: existing.plate,
        brand: existing.brand,
        model: existing.model,
        year: existing.year,
        salePrice: existing.price,
        km: existing.km,
        soldAt: new Date().toISOString(),
        status: 'Vendido',
      });
      soldCount++;
      const pDir = path.join('public', 'cars', 'uploads', existing.slug);
      if (fs.existsSync(pDir)) {
        fs.rmSync(pDir, { recursive: true, force: true });
      }
    }
  }

  // Save local data
  fs.writeFileSync('data/vehicles.json', JSON.stringify(updatedActiveList, null, 2), 'utf8');
  fs.writeFileSync('data/sold_vehicles.json', JSON.stringify(soldArchive, null, 2), 'utf8');

  // Sync to Vercel KV
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    await kv.set('vehicles.json', updatedActiveList);
    await kv.set('sold_vehicles.json', soldArchive);
    console.log('✅ Sincronizado en Vercel KV (activos y vendidos)');
  }

  console.log(`\n========================================`);
  console.log(`Activos en catálogo: ${updatedActiveList.length}`);
  console.log(`Nuevos agregados: ${newCount}`);
  console.log(`Vendidos archivados (Ciencia de datos): ${soldCount}`);
  console.log(`Actualizados: ${updatedCount}`);
  console.log(`Total histórico ventas: ${soldArchive.length}`);
  console.log(`========================================\n`);
}

main().catch(console.error);
