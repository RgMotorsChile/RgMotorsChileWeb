const fs = require('fs');
const path = require('path');
console.error("Este script usaba Vercel KV, que ya no está en el proyecto. Usá scripts/apply-front-covers.mjs para el JSON local.");
process.exit(1);

// Load environment variables if available
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  });
}

const FRONT_PHOTO_MAPPING = {
  'toyota-hilux-4x2-2023-swdv33': 'photo-07.jpg',
  'mitsubishi-l200-katana-4x2-2022-rhkd26': 'photo-02.jpg',
  'toyota-hilux-sr-4x4-2022-rwyr12': 'photo-02.jpg',
  'mitsubishi-katana-4x2-2024-thzf75': 'photo-05.jpg',
  'toyota-hilux-sr-4x4-2024-thsr65': 'photo-02.jpg',
  'mitsubishi-katana-work-4x2-2022-rggz96': 'photo-03.jpg',
  'toyota-raize-4x2-1-2-2025-tsgl82': 'photo-08.jpg',
  'toyota-new-hilux-4x2-2022-rpkd45': 'photo-08.jpg',
  'mitsubishi-l200-work-4x2-2021-pxsv97': 'photo-02.jpg',
  'toyota-hilux-4x4-2022-rzvk91': 'photo-06.jpg',
  'mitsubishi-new-katana-crt-4x2-2019-kwrc91': 'photo-05.jpg',
  'mitsubishi-new-katana-4x2-2023-srcp17': 'photo-07.jpg',
  'mitsubishi-l200-katana-4x4-2020-lxcy98': 'photo-03.jpg',
  'ford-raptor-f150-2025-tskl58': 'photo-02.jpg',
  'ford-raptor-f150-2022-rxzt82': 'photo-02.jpg',
  'ford-raptor-f150-2020-lrjy32': 'photo-02.jpg',
  'subaru-wrx-sti-4x4-2-5-2022-rkrg58': 'photo-02.jpg',
  'hino-xzu-617-dc-2023-sklf13': 'photo-03.jpg',
  'chevrolet-colorado-4x4-aut-2022-sfyb29': 'photo-07.jpg',
  'chevrolet-colorado-4x4-aut-2022-sfbl43': 'photo-01.jpg',
  'nissan-navara-xe-4x4-2021-rdhl11': 'photo-04.jpg',
  'chevrolet-colorado-4x4-2022-rzsy35': 'photo-03.jpg',
  'nissan-navara-4x2-2023-sjtd29': 'photo-03.jpg',
  'nissan-navara-xe-4x2-2024-tcgb98': 'photo-06.jpg',
  'nissan-navara-4x2-2024-tcpt20': 'photo-04.jpg',
  'ford-ranger-4x4-2023-shyl53': 'photo-02.jpg',
  'nissan-navara-4x4-2022-rhyh38': 'photo-04.jpg',
  'volkswagen-amarok-4x4-mt-2022-rrkb78': 'photo-08.jpg',
  'hyundai-porter-ii-2022-rpsh45': 'photo-02.jpg',
  'peugeot-partner-2025-tsxk53': 'photo-02.jpg',
  'maxus-t60-4x2-at-2023-stpz87': 'photo-04.jpg',
  'ssangyong-musso-grand-4x2-2021-rdhb85': 'photo-03.jpg',
  'peugeot-expert-2022-scdw37': 'photo-05.jpg',
  'maxus-t60-4x4-glx-2022-sdds52': 'photo-03.jpg',
  'maxus-t60-dx-4x4-2023-ssdt39': 'photo-11.jpg',
  'chevrolet-dmax-4x2-2020-lxbc60': 'photo-02.jpg',
  'peugeot-partner-2022-svfd42': 'photo-05.jpg',
  'peugeot-partner-1-6-2023-sfxy80': 'photo-10.jpg',
  'peugeot-partner-2023-ssdd57': 'photo-04.jpg',
  'volkswagen-saveiro-dcab-2023-sfrx48': 'photo-08.jpg',
  'omoda-c5-1-5-aut-2025-vblv57': 'photo-02.jpg',
  'volkswagen-saveiro-dc-2023-sfrt83': 'photo-03.jpg',
  'mercedes-benz-ml300-cdi-2011-ddlj95': 'photo-02.jpg',
  'peugeot-partner-2021-psjj97': 'photo-07.jpg',
  'peugeot-partner-2021-pysy84': 'photo-07.jpg',
  'peugeot-partner-hdi-92-l1-1-6-2022-sbzc70': 'photo-02.jpg',
  'mg-zs-1-5-2022-rtzh73': 'photo-02.jpg',
  'ram-v700-2021-ptfc69': 'photo-05.jpg',
  'mg-3-hatch-back-2022-rygb56': 'photo-07.jpg',
  'renault-duster-expression-1-6-2015-hbdz43': 'photo-10.jpg',
  'nissan-terrano-4x2-2012-dxtz99': 'photo-06.jpg',
  'mitsubishi-katana-4x4-2023-sgvc26': 'photo-02.jpg',
  'volkswagen-saveiro-cd-1-6-2022-slgd85': 'photo-03.jpg',
  'mitsubishi-l200-katana-4x4-2020-pgbv11': 'photo-03.jpg',
  'jac-x200-2022-rzwv49': 'photo-02.jpg',
  'changan-alsvin-1-4-2021-plxf40': 'photo-02.jpg',
};

async function main() {
  const jsonPath = path.join(__dirname, '../data/vehicles.json');
  const vehicles = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  let updatedCount = 0;

  for (const v of vehicles) {
    const targetPhoto = FRONT_PHOTO_MAPPING[v.slug];
    if (!targetPhoto) continue;

    const newCoverUrl = `/cars/uploads/${v.slug}/${targetPhoto}`;

    // Verify the physical file exists
    const physicalPath = path.join(__dirname, '../public', newCoverUrl);
    if (!fs.existsSync(physicalPath)) {
      console.warn(`WARNING: File does not exist: ${physicalPath}`);
      continue;
    }

    // Set new cover image
    v.image = newCoverUrl;

    // Rearrange gallery so new cover is first
    if (Array.isArray(v.gallery) && v.gallery.length > 0) {
      const rest = v.gallery.filter(g => g !== newCoverUrl);
      v.gallery = [newCoverUrl, ...rest];
    } else {
      v.gallery = [newCoverUrl];
    }

    updatedCount++;
    console.log(`[OK] ${v.plate} -> Front Cover set to ${targetPhoto}`);
  }

  // Save to data/vehicles.json
  fs.writeFileSync(jsonPath, JSON.stringify(vehicles, null, 2), 'utf8');
  console.log(`\nSuccessfully updated ${updatedCount} vehicles in data/vehicles.json!`);

  // Sync to Vercel KV if available
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      console.log('Syncing updated vehicles to Vercel KV cloud...');
      const kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      await kv.set('vehicles.json', vehicles);
      console.log('✅ Vercel KV successfully updated with front cover photos!');
    } catch (err) {
      console.error('Error syncing to KV:', err.message);
    }
  } else {
    console.log('KV credentials not detected, local vehicles.json updated.');
  }
}

main().catch(console.error);
