import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

function createPlateSvg(w, h) {
  const width = Math.round(w);
  const height = Math.round(h);
  return Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pBg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0e172a"/>
      <stop offset="50%" stop-color="#090d16"/>
      <stop offset="100%" stop-color="#05070d"/>
    </linearGradient>
    <linearGradient id="tGr" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <linearGradient id="acc" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1d4ed8" stop-opacity="0.1"/>
      <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.1"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <rect width="${width}" height="${height}" rx="4" ry="4" fill="url(#pBg)" stroke="#334155" stroke-width="1.5"/>
  <rect x="3" y="3" width="${width - 6}" height="${height - 6}" rx="3" ry="3" fill="none" stroke="#38bdf8" stroke-opacity="0.6" stroke-width="1"/>

  <g filter="url(#shadow)">
    <text x="50%" y="${height * 0.44}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="${height * 0.32}" fill="url(#tGr)" text-anchor="middle" letter-spacing="1.5">
      RG MOTORS
    </text>
  </g>

  <line x1="12" y1="${height * 0.58}" x2="${width - 12}" y2="${height * 0.58}" stroke="url(#acc)" stroke-width="1.2"/>

  <text x="50%" y="${height * 0.74}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="${height * 0.12}" fill="#38bdf8" text-anchor="middle" letter-spacing="2.5">
    AUTOMOTRIZ
  </text>

  <text x="50%" y="${height * 0.90}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="${height * 0.11}" fill="#94a3b8" text-anchor="middle" letter-spacing="1">
    PUERTO MONTT · CHILE
  </text>
</svg>
`);
}

// Automatic detection of license plate rectangle by searching for rectangular clusters
// of blue (Salgado), green (Falabella), or dark plate frames on the vehicle bumper
async function detectPlateRect(imageBuf) {
  const { data, info } = await sharp(imageBuf).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const c = info.channels;

  // Grid scan 20x20 blocks
  const bSize = 20;
  const cols = Math.ceil(w / bSize);
  const rows = Math.ceil(h / bSize);
  const hits = [];

  // Plate is almost always in the lower 35% to 95% of the image and between 15% and 85% horizontally
  const yStart = Math.floor(h * 0.35);
  const yEnd = Math.floor(h * 0.95);
  const xStart = Math.floor(w * 0.15);
  const xEnd = Math.floor(w * 0.85);

  for (let y = yStart; y < yEnd; y += 4) {
    for (let x = xStart; x < xEnd; x += 4) {
      const idx = (y * w + x) * c;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // 1. Salgado Blue: B > 80, B > R*1.4, B > G*1.15, R < 90
      const isSalgadoBlue = b > 80 && b > r * 1.4 && b > g * 1.15 && r < 90 && g < 120;
      
      // 2. Falabella Green: G > 100, G > R*1.4, G > B*1.3
      const isFalabellaGreen = g > 100 && g > r * 1.4 && g > b * 1.3 && r < 80;

      // 3. Yellow text / yellow dot on dark plate frame:
      const isYellowDot = r > 180 && g > 170 && b < 80;

      if (isSalgadoBlue || isFalabellaGreen || isYellowDot) {
        hits.push({ x, y, type: isSalgadoBlue ? "blue" : (isFalabellaGreen ? "green" : "yellow") });
      }
    }
  }

  if (hits.length < 20) return null;

  // Cluster analysis
  const xs = hits.map(pt => pt.x).sort((a, b) => a - b);
  const ys = hits.map(pt => pt.y).sort((a, b) => a - b);

  const p5 = Math.floor(hits.length * 0.05);
  const p95 = Math.floor(hits.length * 0.95);

  const minX = xs[p5];
  const maxX = xs[p95];
  const minY = ys[p5];
  const maxY = ys[p95];

  const rectW = maxX - minX;
  const rectH = maxY - minY;
  const aspect = rectW / rectH;

  // Chilean license plate aspect ratio is roughly 2.0 to 3.2
  // If aspect is reasonable and within valid size
  if (rectW > 50 && rectW < w * 0.5 && rectH > 20 && rectH < h * 0.3) {
    // Add small padding to cleanly cover edges
    const padX = Math.round(rectW * 0.06);
    const padY = Math.round(rectH * 0.12);
    return {
      left: Math.max(0, minX - padX),
      top: Math.max(0, minY - padY),
      width: rectW + padX * 2,
      height: rectH + padY * 2,
      hitsCount: hits.length
    };
  }

  return null;
}

// Hardcoded precision positions for studio/front photos where auto-detection might need exact coordinates
const MANUAL_TARGETS = [
  // 1. Nissan Terrano DXTZ99 (Cover & Gallery)
  { file: "public/cars/inventory/dxtz99/0.jpg", left: 745, top: 765, width: 280, height: 130 },
  { file: "public/cars/real_stock/rg-dxtz99-0.jpg", left: 745, top: 765, width: 280, height: 130 },
  { file: "public/cars/real_stock/auto-dxtz99-salgado-0.jpg", left: 745, top: 765, width: 280, height: 130 },
  
  // 2. Hyundai Tucson FHVC10
  { file: "public/cars/inventory/fhvc10/0.jpg", left: 540, top: 1060, width: 320, height: 130 },
  
  // 3. Subaru Outback HJCW79
  { file: "public/cars/inventory/hjcw79/0.jpg", left: 955, top: 810, width: 215, height: 95 },
  { file: "public/cars/real_stock/rg-hjcw79-1.jpg", left: 955, top: 810, width: 215, height: 95 },
  { file: "public/cars/real_stock/auto-hjcw79-1.jpg", left: 955, top: 810, width: 215, height: 95 },
  
  // 4. Peugeot 2008 JSPB25
  { file: "public/cars/inventory/jspb25/0.jpg", left: 885, top: 885, width: 235, height: 105 },
  { file: "public/cars/real_stock/rg-jspb25-0.jpg", left: 885, top: 885, width: 235, height: 105 },
  { file: "public/cars/real_stock/auto-jspb25-0.jpg", left: 885, top: 885, width: 235, height: 105 },
  
  // 5. Nissan Terrano CVFF32
  { file: "public/cars/inventory/cvff32/0.jpg", left: 505, top: 790, width: 350, height: 120 },

  // 6. Toyota Urban Cruiser FVRG86
  { file: "public/cars/inventory/fvrg86/0.jpg", left: 245, top: 490, width: 205, height: 105 },
  { file: "public/cars/inventory/fvrg86/2.jpg", left: 195, top: 765, width: 145, height: 80 },

  // 7. Chevrolet D-Max GWPF76
  { file: "public/cars/inventory/gwpf76/0.jpg", left: 990, top: 885, width: 175, height: 85 },

  // 8. Mitsubishi L200 JDDY77
  { file: "public/cars/inventory/jddy77/0.jpg", left: 975, top: 795, width: 170, height: 80 },

  // 9. Mitsubishi L200 JGRF99
  { file: "public/cars/inventory/jgrf99/0.jpg", left: 580, top: 845, width: 330, height: 110 },

  // 10. Fiat Fiorino JZKB82
  { file: "public/cars/inventory/jzkb82/0.jpg", left: 535, top: 935, width: 300, height: 105 },

  // 11. Maxus T60 JZWG23
  { file: "public/cars/inventory/jzwg23/4.jpg", left: 1050, top: 745, width: 155, height: 75 },

  // 12. Toyota Hilux LPBR18
  { file: "public/cars/inventory/lpbr18/0.jpg", left: 645, top: 1080, width: 305, height: 115 },
  { file: "public/cars/real_stock/rg-lpbr18-1.jpg", left: 645, top: 1080, width: 305, height: 115 },
  { file: "public/cars/real_stock/auto-lpbr18-1.jpg", left: 645, top: 1080, width: 305, height: 115 },

  // 13. DFSK Glory 580 KXDZ62
  { file: "public/cars/inventory/kxdz62/0.jpg", left: 642, top: 995, width: 318, height: 130 },
  { file: "public/cars/real_stock/rg-kxdz62-0.jpg", left: 642, top: 995, width: 318, height: 130 },
  { file: "public/cars/real_stock/auto-kxdz62-0.jpg", left: 642, top: 995, width: 318, height: 130 },

  // 14. Toyota Hilux White ILUX2017
  { file: "public/cars/inventory/ilux2017/0.jpg", left: 535, top: 925, width: 285, height: 95 },

  // Studio Salgado Cars (bottom composite split in 2.jpg / 0.jpg)
  // Kia Cerato
  { file: "public/cars/inventory/cerato/0.jpg", left: 615, top: 980, width: 180, height: 65 },
  { file: "public/cars/inventory/cerato/2.jpg", left: 605, top: 1130, width: 170, height: 60 },
  { file: "public/cars/inventory/cerato/2.jpg", left: 980, top: 465, width: 135, height: 50 },

  // Chevrolet Camaro
  { file: "public/cars/inventory/camaroiii/0.jpg", left: 600, top: 1070, width: 240, height: 75 },
  { file: "public/cars/inventory/camaroiii/2.jpg", left: 595, top: 1135, width: 200, height: 65 },
  { file: "public/cars/inventory/camaroiii/2.jpg", left: 305, top: 485, width: 140, height: 55 },

  // BAIC X55
  { file: "public/cars/inventory/baicx55/2.jpg", left: 580, top: 1140, width: 200, height: 70 },
  
  // Chery Tiggo 2
  { file: "public/cars/inventory/cherytiggo2/2.jpg", left: 590, top: 1135, width: 190, height: 65 },

  // Chevrolet Captiva
  { file: "public/cars/inventory/chevroletcaptiva/2.jpg", left: 590, top: 1130, width: 200, height: 70 },

  // Chevrolet Tracker
  { file: "public/cars/inventory/chvrolettracker12t/2.jpg", left: 585, top: 1130, width: 200, height: 70 },

  // Ford Ranger
  { file: "public/cars/inventory/fordranger/2.jpg", left: 585, top: 1130, width: 200, height: 70 },

  // Peugeot 2008 Studio
  { file: "public/cars/inventory/gaut2008/2.jpg", left: 585, top: 1130, width: 200, height: 70 },

  // Peugeot 208 Studio
  { file: "public/cars/inventory/gaut208/2.jpg", left: 585, top: 1130, width: 200, height: 70 },

  // Peugeot 3008 GT Studio
  { file: "public/cars/inventory/gaut3008/2.jpg", left: 585, top: 1130, width: 200, height: 70 },

  // Hyundai Grand i10 Studio
  { file: "public/cars/inventory/grandi10blanco/2.jpg", left: 585, top: 1130, width: 200, height: 70 },

  // Hyundai i20 Studio
  { file: "public/cars/inventory/i20202014/2.jpg", left: 585, top: 1130, width: 200, height: 70 },
];

async function applyRGPlate(filePath, left, top, width, height) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const inputBuf = fs.readFileSync(filePath);
    const svg = createPlateSvg(width, height);
    const png = await sharp(svg).png().toBuffer();

    const outputBuf = await sharp(inputBuf)
      .composite([{ input: png, left: Math.round(left), top: Math.round(top) }])
      .jpeg({ quality: 90 })
      .toBuffer();

    fs.writeFileSync(filePath, outputBuf);
    return true;
  } catch (err) {
    console.error(`Error aplicando placa en ${filePath}:`, err.message);
    return false;
  }
}

async function main() {
  console.log("🚀 Aplicando cubrepatente oficial RG MOTORS a todos los vehículos con cubrepatente Salgado / terceros...");

  let manualCount = 0;
  for (const t of MANUAL_TARGETS) {
    const ok = await applyRGPlate(t.file, t.left, t.top, t.width, t.height);
    if (ok) {
      console.log(`✅ [Manual] Cubrepatente RG Motors aplicada en: ${t.file}`);
      manualCount++;
    }
  }

  // Scan all inventory photos for any remaining Salgado blue / Falabella green plates
  const invDir = "public/cars/inventory";
  const folders = fs.readdirSync(invDir);
  let autoCount = 0;

  for (const f of folders) {
    const fPath = path.join(invDir, f);
    if (!fs.statSync(fPath).isDirectory()) continue;
    const files = fs.readdirSync(fPath).filter(x => x.endsWith(".jpg"));

    for (const file of files) {
      const fullPath = path.join(fPath, file);
      
      // Skip if already in manual list
      const isManual = MANUAL_TARGETS.some(t => path.normalize(t.file) === path.normalize(fullPath));
      if (isManual) continue;

      try {
        const buf = fs.readFileSync(fullPath);
        const detected = await detectPlateRect(buf);
        if (detected) {
          console.log(`🔍 [Auto-Detect] Placa encontrada en ${fullPath} (${detected.hitsCount} pts):`, detected);
          const ok = await applyRGPlate(fullPath, detected.left, detected.top, detected.width, detected.height);
          if (ok) autoCount++;
        }
      } catch (err) {
        /* ignore */
      }
    }
  }

  console.log(`\n🎉 PROCESO COMPLETADO: Cubrepatente RG Motors aplicada exitosamente en ${manualCount} fotos manuales y ${autoCount} fotos auto-detectadas.`);
}

main().catch(console.error);
