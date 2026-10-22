/**
 * Descarga carpetas de fotos por patente desde Google Drive y las empareja al stock.
 *
 * Carpeta: https://drive.google.com/drive/folders/1etQDf-_InkLx8m4_AUMnc8xg2O_137St
 *
 * Uso:
 *   node scripts/sync-drive-photos-by-plate.mjs
 *
 * Si Drive pide login, se abre Edge y esperás hasta 3 min para iniciar sesión.
 * Unidades sin carpeta/fotos → placeholder azul "fotografías en preparación".
 */
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";
import { pickFrontCoverFile, withFrontCover } from "./lib/front-cover-map.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FOLDER_ID = "1etQDf-_InkLx8m4_AUMnc8xg2O_137St";
const PLACEHOLDER = "/images/placeholder-pending-car.svg";
const MAX_PHOTOS = 12;
const LOGIN_WAIT_MS = 180_000;

const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) {
      process.env[t.slice(0, i).trim()] = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
}

function cleanPlate(p) {
  return String(p || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function extractPlate(text) {
  const compact = String(text || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  // Patente chilena típica: 4 letras + 2 dígitos o 2 letras + 4 dígitos
  const m =
    compact.match(/[A-Z]{4}\d{2}/) ||
    compact.match(/[A-Z]{2}\d{4}/) ||
    compact.match(/[A-Z]{3}\d{3}/);
  return m ? m[0] : "";
}

function downloadImage(fileId, destPath) {
  const url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  return new Promise((resolve) => {
    function fetchWithRedirect(u, redirectCount = 0) {
      if (redirectCount > 6) return resolve(false);
      https
        .get(
          u,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          },
          (res) => {
            if (
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              return fetchWithRedirect(res.headers.location, redirectCount + 1);
            }
            if (res.statusCode !== 200) return resolve(false);
            const stream = fs.createWriteStream(destPath);
            res.pipe(stream);
            stream.on("finish", () => {
              stream.close();
              try {
                if (fs.statSync(destPath).size > 12000) resolve(true);
                else {
                  fs.unlinkSync(destPath);
                  resolve(false);
                }
              } catch {
                resolve(false);
              }
            });
            stream.on("error", () => {
              try {
                fs.unlinkSync(destPath);
              } catch {}
              resolve(false);
            });
          },
        )
        .on("error", () => resolve(false));
    }
    fetchWithRedirect(url);
  });
}

async function collectFolderItems(page) {
  const found = new Map();
  let stagnant = 0;
  for (let step = 0; step < 120 && stagnant < 20; step++) {
    const items = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("[data-id]").forEach((el) => {
        const id = el.getAttribute("data-id");
        const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
        if (id && text && id.length > 10) out.push({ id, text });
      });
      return out;
    });
    let added = 0;
    for (const it of items) {
      if (!found.has(it.id)) {
        found.set(it.id, it.text);
        added++;
      }
    }
    stagnant = added === 0 ? stagnant + 1 : 0;
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(280);
  }
  return [...found.entries()].map(([id, rawText]) => {
    const name = rawText.split("\n")[0].trim();
    return { id, name, plate: extractPlate(name) || extractPlate(rawText), rawText };
  });
}

async function waitForDriveAccess(page) {
  const target = `https://drive.google.com/drive/folders/${FOLDER_ID}?usp=sharing`;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
  const start = Date.now();
  while (Date.now() - start < LOGIN_WAIT_MS) {
    const url = page.url();
    const title = await page.title();
    const signedIn =
      url.includes("drive.google.com/drive") &&
      !/signin|accounts\.google/i.test(url) &&
      !/inicio de sesi[oó]n|sign-?in/i.test(title);
    if (signedIn) {
      await page.waitForTimeout(2500);
      return true;
    }
    console.log(
      "Esperando inicio de sesión en Google Drive… (iniciá sesión en la ventana de Edge)",
    );
    await page.waitForTimeout(4000);
  }
  return false;
}

function writeVehiclesTs(vehicles) {
  const existing = path.join(ROOT, "lib", "vehicles.ts");
  const src = fs.readFileSync(existing, "utf8");
  const marker = "export const initialVehicles: Vehicle[] = ";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("No se encontró initialVehicles en lib/vehicles.ts");
  const arrStart = src.indexOf("[", start);
  const endMarker = "\nexport const HERO_SHOWCASE_VEHICLES";
  const end = src.indexOf(endMarker);
  if (arrStart < 0 || end < 0) throw new Error("Estructura inesperada en lib/vehicles.ts");
  const next =
    src.slice(0, arrStart) +
    JSON.stringify(vehicles, null, 2) +
    ";" +
    src.slice(end);
  fs.writeFileSync(existing, next, "utf8");
}

async function main() {
  const vehiclesPath = path.join(ROOT, "data", "vehicles.json");
  const vehicles = JSON.parse(fs.readFileSync(vehiclesPath, "utf8"));
  const byPlate = new Map();
  for (const v of vehicles) {
    const p = cleanPlate(v.plate);
    if (p) byPlate.set(p, v);
  }

  console.log(`Stock: ${vehicles.length} unidades`);
  console.log(`Drive folder: ${FOLDER_ID}`);

  const browser = await chromium.launch({
    channel: "msedge",
    headless: false,
  });
  const page = await browser.newPage();

  const ok = await waitForDriveAccess(page);
  if (!ok) {
    await browser.close();
    console.error(
      "No se pudo acceder a Drive. Compartí la carpeta como 'Cualquier persona con el enlace' o volvé a correr el script e iniciá sesión.",
    );
    process.exit(1);
  }

  console.log("Listando carpetas por patente…");
  const items = await collectFolderItems(page);
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "scratch", "drive-plate-folders.json"),
    JSON.stringify(items, null, 2),
  );
  console.log(`Ítems en Drive: ${items.length}`);

  // Prefer folders that look like plates
  const plateFolders = items.filter((it) => it.plate && byPlate.has(it.plate));
  console.log(`Carpetas que matchean stock: ${plateFolders.length}`);

  const matchedPlates = new Set();
  let downloadedVehicles = 0;

  for (let i = 0; i < plateFolders.length; i++) {
    const folder = plateFolders[i];
    const vehicle = byPlate.get(folder.plate);
    if (!vehicle) continue;
    matchedPlates.add(folder.plate);
    const slug = vehicle.slug;
    console.log(
      `\n[${i + 1}/${plateFolders.length}] ${folder.plate} · ${vehicle.brand} ${vehicle.model}`,
    );

    try {
      await page.goto(`https://drive.google.com/drive/folders/${folder.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(1800);
    } catch (err) {
      console.warn("  No se pudo abrir carpeta:", err.message);
      continue;
    }

    const photos = await page.evaluate(() => {
      const list = [];
      const seen = new Set();
      document.querySelectorAll("[data-id]").forEach((el) => {
        const id = el.getAttribute("data-id");
        const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
        if (!id || seen.has(id) || id.length < 20) return;
        if (/\.(heic|jpg|jpeg|png|webp|avif)/i.test(text) || /image/i.test(text)) {
          seen.add(id);
          list.push({ id, name: text.split("\n")[0] });
        }
      });
      return list;
    });

    if (!photos.length) {
      console.log("  Sin fotos visibles");
      continue;
    }

    const uploadDir = path.join(ROOT, "public", "cars", "uploads", slug);
    fs.mkdirSync(uploadDir, { recursive: true });

    const files = [];
    const toGet = photos.slice(0, MAX_PHOTOS);
    for (let pIdx = 0; pIdx < toGet.length; pIdx++) {
      const fileName = `photo-${String(pIdx + 1).padStart(2, "0")}.jpg`;
      const dest = path.join(uploadDir, fileName);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 12000) {
        files.push(fileName);
        continue;
      }
      const okDl = await downloadImage(toGet[pIdx].id, dest);
      if (okDl) files.push(fileName);
    }

    if (!files.length) {
      console.log("  Descarga falló");
      continue;
    }

    const preferred = pickFrontCoverFile(slug, files);
    const cover = `/cars/uploads/${slug}/${preferred}`;
    const gallery = [
      cover,
      ...files.filter((f) => f !== preferred).map((f) => `/cars/uploads/${slug}/${f}`),
    ];
    Object.assign(vehicle, {
      image: cover,
      gallery,
      hasRealPhotos: true,
    });
    Object.assign(vehicle, withFrontCover(vehicle));
    downloadedVehicles++;
    console.log(`  OK ${files.length} fotos · portada ${preferred}`);
  }

  await browser.close();

  // Unidades sin match → placeholder azul
  let placeholders = 0;
  for (const v of vehicles) {
    const p = cleanPlate(v.plate);
    const hasLocal =
      v.hasRealPhotos &&
      v.image &&
      !v.image.includes("placeholder") &&
      fs.existsSync(path.join(ROOT, "public", v.image));

    if (!matchedPlates.has(p) && !hasLocal) {
      v.image = PLACEHOLDER;
      v.gallery = [];
      v.hasRealPhotos = false;
      placeholders++;
    } else if (hasLocal && (!v.gallery || !v.gallery.length)) {
      // conservar fotos locales previas
      v.hasRealPhotos = true;
    }
  }

  // Reaplicar portadas frontales cuando haya mapa
  for (let i = 0; i < vehicles.length; i++) {
    if (vehicles[i].hasRealPhotos) vehicles[i] = withFrontCover(vehicles[i]);
  }

  fs.writeFileSync(vehiclesPath, JSON.stringify(vehicles, null, 2), "utf8");
  writeVehiclesTs(vehicles);

  console.log("\n=== Resumen ===");
  console.log(`Con fotos desde Drive (match patente): ${downloadedVehicles}`);
  console.log(`Placeholder (sin fotos): ${placeholders}`);
  console.log(
    `Con fotos reales totales: ${vehicles.filter((v) => v.hasRealPhotos).length}`,
  );
  console.log("Actualizado: data/vehicles.json + lib/vehicles.ts");

  console.log(
    "Vercel KV ya no se usa. El catálogo de producción está en Supabase (catalog_vehicles).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
