import { getVehicles, replaceAllVehicles } from "./vehiclesStore";
import { archiveSoldVehicle, getSoldVehicles } from "./soldVehiclesStore";
import { releaseVehiclePhotos } from "./vehiclePhotoGc";
import { Vehicle } from "@/lib/vehicles";
import { publicVehicleSlug } from "@/lib/vehicles/publicSlug";
import {
  evaluateSheetWipeGuard,
  guessBodyTypeFromModel,
  isBlankSheetRow,
  isExcludedInventorySection,
  isPatioRgConsignedRow,
  isInventorySheetTab,
  isSellableSheetRow,
} from "@/lib/server/sheetSyncGuards";
import * as XLSX from "xlsx";
import https from "node:https";

const FALLBACK_SHEET_ID = "1BG2uR6APbXEMvVvRmdR-Nn0Vko6eobJ6Xam0XX41Ldc";

/** IDs de Google Sheets: alfanumérico + _/- (evita path injection / SSRF). */
function isValidGoogleSheetId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{20,128}$/.test(id);
}

function resolveSheetId(customSheetId?: string): string {
  const candidates = [
    customSheetId?.trim(),
    process.env.GOOGLE_SHEET_ID?.trim(),
    FALLBACK_SHEET_ID,
  ];
  for (const id of candidates) {
    if (id && isValidGoogleSheetId(id)) return id;
  }
  return FALLBACK_SHEET_ID;
}

function fetchBuffer(url: string, redirectCount = 0): Promise<{ buffer: Buffer; statusCode: number }> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("Demasiadas redirecciones"));

    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchBuffer(res.headers.location, redirectCount + 1));
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        resolve({ buffer: Buffer.concat(chunks), statusCode: res.statusCode || 200 });
      });
      res.on("error", reject);
    });
  });
}

function cleanPlate(p: unknown): string {
  if (!p) return "";
  return String(p).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function cleanBrand(b: unknown): string {
  if (!b) return "Otro";
  const s = String(b).trim().toUpperCase();
  const map: Record<string, string> = {
    MITSUBISHI: "Mitsubishi",
    TOYOTA: "Toyota",
    PEUGEOT: "Peugeot",
    NISSAN: "Nissan",
    CHEVROLET: "Chevrolet",
    FORD: "Ford",
    VOLKSWAGEN: "Volkswagen",
    VOLSWAGEN: "Volkswagen",
    MAXUS: "Maxus",
    MG: "MG",
    SSANGYONG: "SsangYong",
    SSANYONG: "SsangYong",
    HYUNDAI: "Hyundai",
    RENAULT: "Renault",
    MERCEDEZ: "Mercedes-Benz",
    "MERCEDES-BENZ": "Mercedes-Benz",
    SUBARU: "Subaru",
    OMODA: "Omoda",
    CHANGAN: "Changan",
    HINO: "Hino",
    RAM: "RAM",
    JAC: "JAC",
    FIAT: "Fiat",
    CHERY: "Chery",
    SUZUKI: "Suzuki",
    KIA: "Kia",
  };
  return map[s] || s.charAt(0) + s.slice(1).toLowerCase();
}

function cleanColor(c: unknown): string {
  if (!c) return "Blanco";
  const cl = String(c).trim().toLowerCase();
  if (cl.includes("rojo") || cl.includes("roja")) return "Rojo";
  if (cl.includes("blanco") || cl.includes("blanca")) return "Blanco";
  if (cl.includes("gris") || cl.includes("platead") || cl.includes("plata")) return "Gris";
  if (cl.includes("azul")) return "Azul";
  if (cl.includes("negro") || cl.includes("negra")) return "Negro";
  if (cl.includes("celeste")) return "Celeste";
  if (cl.includes("verde")) return "Verde";
  return String(c).charAt(0).toUpperCase() + String(c).slice(1).toLowerCase();
}

type SheetAmount = { n: number; plainThousands: boolean };

/**
 * Lee una celda de precio. `plainThousands` solo si el valor es un entero
 * corto y limpio (7990), no un texto del que se extrajeron dígitos
 * ("CAMION 16-09" → 1609).
 */
function readSheetAmount(s: unknown): SheetAmount {
  if (typeof s === "number" && Number.isFinite(s)) {
    let n = Math.round(s);
    if (n > 100_000_000) n = Math.round(n / 100);
    return { n, plainThousands: n >= 1_000 && n < 100_000 };
  }
  if (s == null || s === "") return { n: 0, plainThousands: false };
  const str = String(s).trim();
  if (
    /falta|reservado|preparacion|terminar|taller|casa|consignado|rq|fotos|vendido|entregado/i.test(
      str,
    )
  ) {
    return { n: 0, plainThousands: false };
  }
  const clean = str.replace(/[^0-9]/g, "");
  if (!clean) return { n: 0, plainThousands: false };
  let n = parseInt(clean, 10);
  if (n > 100_000_000) n = Math.round(n / 100);
  const plainThousands = /^\d{4,5}$/.test(str) && n >= 1_000 && n < 100_000;
  return { n, plainThousands };
}

/**
 * PHZD48 tiene lista `$8.490.000` y oferta numérica `7990` (miles).
 * Solo se escala si la otra celda ya es un precio en pesos y el resultado
 * queda en el mismo orden de magnitud. 78 o "CAMION 16-09" no se tocan.
 */
function scalePlainThousands(amount: SheetAmount, other: SheetAmount): number {
  if (!amount.plainThousands || other.plainThousands) return amount.n;
  const scaled = amount.n * 1_000;
  if (
    other.n >= 1_000_000 &&
    scaled >= other.n * 0.5 &&
    scaled <= other.n * 1.05
  ) {
    return scaled;
  }
  return amount.n;
}

export function parsePrice(
  rawOffer: unknown,
  rawList: unknown,
): { price: number; listPrice?: number } {
  const offerRaw = readSheetAmount(rawOffer);
  const listRaw = readSheetAmount(rawList);
  const offer = scalePlainThousands(offerRaw, listRaw);
  const list = scalePlainThousands(listRaw, offerRaw);
  if (offer > 0) return { price: offer, listPrice: list > offer ? list : undefined };
  if (list > 0) return { price: list, listPrice: undefined };
  return { price: 0, listPrice: undefined };
}

function parseKm(raw: unknown): number {
  if (!raw) return 0;
  const str = String(raw);
  if (/falta|consignado|ald|c\.poder|rq|fotos|en revision/i.test(str)) return 0;
  const kmPart = str.split(/km/i)[0];
  const clean = (kmPart || str).replace(/[^0-9]/g, "");
  return clean ? parseInt(clean, 10) : 0;
}

const PLATE_RE = /[A-Z]{2,4}[0-9]{2,4}/;

export type SheetVehicleRow = {
  plate: string;
  brand: string;
  model: string;
  color: string;
  year: number;
  listPrice?: number;
  price: number;
  km: number;
  supplier: string;
  isSold: boolean;
  sellable: boolean;
};

/**
 * Lee el bloque a la venta. Una fila vacía no corta: pueden venir más autos.
 * Se corta al encabezado de preparación, taller, Salgado u otro bloque ajeno
 * (DON RUDY, CONSIGNADOS CASA CLIENTE). RESERVADA y sin precio dejan esa
 * fila fuera y la lectura sigue.
 */
export function extractSheetVehicles(rows: unknown[][]): SheetVehicleRow[] {
  const out: SheetVehicleRow[] = [];
  let cutAtSection = false;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (isBlankSheetRow(r)) continue;

    const cells = r as unknown[];
    const cleanP = cleanPlate(cells[1]);
    const plateOk = cleanP.length === 6 && PLATE_RE.test(cleanP);
    if (!plateOk) {
      if (isExcludedInventorySection(cells)) cutAtSection = true;
      continue;
    }
    // Bajo otro bloque solo entran los consignados en patio RG.
    const patioRg = isPatioRgConsignedRow(cells);
    if (cutAtSection && !patioRg) continue;

    const rawText = cells.map((cell) => String(cell ?? "")).join(" ").toUpperCase();
    const isSold =
      rawText.includes("VENDIDO") ||
      rawText.includes("ENTREGADO") ||
      rawText.includes("VTA") ||
      (patioRg && rawText.includes("RESERVAD"));
    const { price, listPrice } = parsePrice(cells[7], cells[6]);
    const km = parseKm(cells[8]);
    const brand = cleanBrand(cells[2]);
    const model = String(cells[3] || "").trim().toUpperCase();
    const year = parseInt(String(cells[5]), 10) || 0;
    const sellable =
      !isSold &&
      isSellableSheetRow({
        price,
        km,
        brand,
        model,
        year,
        rawParts: [cells[6], cells[7], cells[8]],
      });

    out.push({
      plate: cleanP,
      brand,
      model,
      color: cleanColor(cells[4]),
      year: year || 2022,
      price,
      listPrice,
      km,
      supplier: String(cells[9] || "").trim(),
      isSold,
      sellable,
    });
  }

  return out;
}

export interface SyncReport {
  success: boolean;
  message: string;
  totalActive: number;
  newVehicles: number;
  soldVehicles: number;
  updatedVehicles: number;
  sheetAccessGranted: boolean;
  timestamp: string;
  /** Sync abortado por hoja vacía / scrape fallido */
  antiWipe?: boolean;
  /** Altas/updates OK pero no se archivó masivo por caída sospechosa */
  antiWipeSkippedArchive?: boolean;
  /** Filas en hoja omitidas (preparación / sin precio / sin km) */
  skippedIncomplete?: number;
  /** Filas de inventario leídas en la pestaña del tenant. */
  rowsRead?: number;
}

/**
 * Un auto que ya no está en la planilla de ESTE sitio se archiva y suelta
 * fotos y giro en el mismo sync. El anti-wipe no borra. Otro tenant no.
 * Borrador, vendido y en preparación no se tocan.
 */
export function shouldReleaseRemovedVehicle(opts: {
  plateOnSheet: boolean;
  status?: string;
  skipArchive: boolean;
  tenantSlug: string;
}): boolean {
  if (opts.skipArchive || opts.plateOnSheet || opts.tenantSlug !== "rg-motors") return false;
  const status = opts.status || "Disponible";
  return status !== "Vendido" && status !== "Borrador" && status !== "En preparación";
}

export async function syncFromLiveGoogleSheet(
  customSheetId?: string,
  opts?: { tenantSlug?: string },
): Promise<SyncReport> {
  const tenantSlug = opts?.tenantSlug || "rg-motors";
  const sheetId = resolveSheetId(customSheetId);
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;

  console.log(
    `[GoogleSheetSync] Descargando inventario (${sheetId}) tenant=${tenantSlug}…`,
  );

  let res: { buffer: Buffer; statusCode: number };
  try {
    res = await fetchBuffer(exportUrl);
  } catch (err) {
    return {
      success: false,
      message: `Error al conectar con Google Sheets: ${err instanceof Error ? err.message : "Error de red"}`,
      totalActive: 0,
      newVehicles: 0,
      soldVehicles: 0,
      updatedVehicles: 0,
      sheetAccessGranted: false,
      timestamp: new Date().toISOString(),
    };
  }

  // Check if spreadsheet returned 401 / html login page
  const head = res.buffer.slice(0, 100).toString("utf8");
  if (res.statusCode === 401 || head.includes("<!DOCTYPE") || head.includes("<html")) {
    return {
      success: false,
      message:
        "La hoja de cálculo está en modo 'Restringido'. Para permitir la sincronización automática diaria, abre la hoja de Google, haz clic en 'Compartir' y cambia el Acceso general a 'Cualquier persona que tenga el vínculo puede ser Lector'.",
      totalActive: 0,
      newVehicles: 0,
      soldVehicles: 0,
      updatedVehicles: 0,
      sheetAccessGranted: false,
      timestamp: new Date().toISOString(),
    };
  }

  // Parse XLSX workbook
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(res.buffer, { type: "buffer" });
  } catch (err) {
    return {
      success: false,
      message: `Error al procesar el archivo Excel descargado: ${err instanceof Error ? err.message : "Formato inválido"}`,
      totalActive: 0,
      newVehicles: 0,
      soldVehicles: 0,
      updatedVehicles: 0,
      sheetAccessGranted: false,
      timestamp: new Date().toISOString(),
    };
  }

  const sheetVehicles: SheetVehicleRow[] = [];

  for (const name of workbook.SheetNames) {
    if (!isInventorySheetTab(name, tenantSlug)) continue;

    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    sheetVehicles.push(...extractSheetVehicles(rows));
  }

  const skippedIncomplete = sheetVehicles.filter((s) => !s.isSold && !s.sellable).length;
  console.log(
    `[GoogleSheetSync] ${sheetVehicles.length} filas en RG MOTORS (${sheetVehicles.filter((s) => s.sellable).length} listos, ${skippedIncomplete} incompletos/preparación omitidos).`,
  );

  // Load current inventory
  const currentVehicles = await getVehicles({
    bypassCache: true,
    tenantSlug,
    scope: "staff",
  });
  const currentActive = currentVehicles.filter((v) => {
    const st = v.status || "Disponible";
    return st !== "Vendido" && st !== "Borrador" && st !== "En preparación";
  });
  const currentPlateMap = new Map<string, Vehicle>();
  currentVehicles.forEach((v) => {
    const p = cleanPlate(v.plate);
    currentPlateMap.set(p, v);
  });

  const sheetReadyRows = sheetVehicles.filter((s) => s.sellable);
  /** Cualquier placa presente en la hoja (incluso incompleta) no se archiva como vendida. */
  const platesOnSheet = new Set(sheetVehicles.map((s) => s.plate));
  let wouldArchive = 0;
  for (const [plate, existing] of currentPlateMap.entries()) {
    const st = existing.status || "Disponible";
    if (
      !platesOnSheet.has(plate) &&
      st !== "Vendido" &&
      st !== "Borrador" &&
      st !== "En preparación"
    ) {
      wouldArchive++;
    }
  }

  const sheetOverlap = sheetReadyRows.filter((s) =>
    currentPlateMap.has(s.plate),
  ).length;
  const wipeGuard = evaluateSheetWipeGuard({
    sheetActiveCount: sheetReadyRows.length,
    currentActiveCount: currentActive.length,
    wouldArchiveCount: wouldArchive,
    sheetOverlapCount: sheetOverlap,
  });

  if (wipeGuard.abortAll) {
    console.error(`[GoogleSheetSync] ${wipeGuard.reason}`);
    return {
      success: false,
      message: wipeGuard.reason,
      totalActive: currentActive.length,
      newVehicles: 0,
      soldVehicles: 0,
      updatedVehicles: 0,
      sheetAccessGranted: true,
      antiWipe: true,
      skippedIncomplete,
      rowsRead: sheetVehicles.length,
      timestamp: new Date().toISOString(),
    };
  }

  if (wipeGuard.skipArchive) {
    console.warn(`[GoogleSheetSync] ${wipeGuard.reason}`);
  }

  let newCount = 0;
  let updatedCount = 0;
  let soldCount = 0;
  const soldForPhotoRelease: Vehicle[] = [];

  const updatedActiveList: Vehicle[] = [];
  // Autos que la sync sacó por error y vuelven: recuperar ficha del historial.
  const soldByPlate = new Map<string, Awaited<ReturnType<typeof getSoldVehicles>>[number]>();
  for (const r of await getSoldVehicles().catch(() => [])) {
    const p = cleanPlate(r.plate);
    if (p && !soldByPlate.has(p)) soldByPlate.set(p, r);
  }
  const known = (v?: string) => (v && v !== "Por confirmar" ? v : undefined);

  for (const item of sheetVehicles) {
    // If marked as sold directly in sheet
    if (item.isSold) {
      if (currentPlateMap.has(item.plate)) {
        const existing = currentPlateMap.get(item.plate)!;
        await archiveSoldVehicle(
          existing,
          item.price,
          "Marcado como Vendido en planilla Google Sheets",
        );
        soldForPhotoRelease.push(existing);
        soldCount++;
      }
      continue;
    }

    // Preparación / sin precio / sin km → no publicar ni archivar como venta
    if (!item.sellable) {
      continue;
    }

    if (currentPlateMap.has(item.plate)) {
      // Update existing vehicle
      const existing = currentPlateMap.get(item.plate)!;
      let changed = false;
      if (item.price > 0 && item.price !== existing.price) {
        existing.price = item.price;
        changed = true;
      }
      if (item.km > 0 && item.km !== existing.km) {
        existing.km = item.km;
        changed = true;
      }
      if (existing.status === "Borrador" || existing.status === "En preparación") {
        existing.status = "Disponible";
        changed = true;
      }
      if (changed) updatedCount++;
      updatedActiveList.push(existing);
    } else {
      // New vehicle in sheet — sin inventar diésel/manual/4x4
      const formattedPlate = `${item.plate.slice(0, 4)} ${item.plate.slice(4)}`;
      const version = `${item.model} · ${item.color}`;
      const slug = publicVehicleSlug({
        slug: `${item.brand}-${item.model}-${item.year}-${item.plate}`.toLowerCase(),
        brand: item.brand,
        model: item.model,
        version,
        year: item.year,
        plate: item.plate,
      });

      const newV: Vehicle = {
        slug,
        plate: formattedPlate,
        brand: item.brand,
        model: item.model,
        version: `${item.model} · ${item.color}`,
        year: item.year,
        price: item.price,
        listPrice: item.listPrice,
        km: item.km,
        fuel: "Por confirmar",
        transmission: "Por confirmar",
        bodyType: guessBodyTypeFromModel(item.model),
        location: "Puerto Montt · Av. Cardonal",
        image: "/images/placeholder-pending-car.svg",
        gallery: [],
        hasRealPhotos: false,
        supplier: item.supplier || "RG Motors",
        status: "Disponible",
        engine: "Por confirmar",
        power: "Por confirmar",
        traction: "Por confirmar",
        doors: 4,
        owners: 1,
        featured: item.brand === "Toyota" || item.brand === "Mitsubishi",
        highlights: [
          "Inspección mecánica rigurosa de 150 puntos",
          "Documentación y transferencia al día",
          "Financiamiento y retoma de vehículos en parte de pago",
        ],
      };
      const prev = soldByPlate.get(item.plate);
      if (prev) {
        newV.fuel = known(prev.fuel) || newV.fuel;
        newV.transmission = known(prev.transmission) || newV.transmission;
        newV.bodyType = known(prev.bodyType) || newV.bodyType;
        if (prev.version) newV.version = prev.version;
      }
      updatedActiveList.push(newV);
      newCount++;
    }
  }

  // Check if any previously active vehicles are no longer in the sheet (sold/discontinued)
  if (!wipeGuard.skipArchive) {
    for (const [plate, existing] of currentPlateMap.entries()) {
      const st = existing.status || "Disponible";
      const leftThisSheet = !platesOnSheet.has(plate) && st !== "Vendido" && st !== "Borrador" && st !== "En preparación";
      if (leftThisSheet) {
        if (shouldReleaseRemovedVehicle({
          plateOnSheet: false,
          status: st,
          skipArchive: false,
          tenantSlug,
        })) {
          await archiveSoldVehicle(
            existing,
            existing.price,
            "Vehículo retirado de inventario activo (Vendido/Entregado)",
          );
          soldForPhotoRelease.push(existing);
        }
        soldCount++;
      }
    }
  } else {
    // Conservar en activo los que no vinieron en la hoja
    for (const [plate, existing] of currentPlateMap.entries()) {
      const st = existing.status || "Disponible";
      if (
        !platesOnSheet.has(plate) &&
        st !== "Vendido" &&
        st !== "Borrador" &&
        st !== "En preparación" &&
        !updatedActiveList.some((v) => cleanPlate(v.plate) === plate)
      ) {
        updatedActiveList.push(existing);
      }
    }
  }

  // Sort updated active list (Toyota and Mitsubishi first, then by price)
  updatedActiveList.sort((a, b) => {
    const aTop = (a.brand === "Toyota" || a.brand === "Mitsubishi") && a.price > 0;
    const bTop = (b.brand === "Toyota" || b.brand === "Mitsubishi") && b.price > 0;
    if (aTop && !bTop) return -1;
    if (!aTop && bTop) return 1;
    return b.price - a.price;
  });

  // Persistencia + invalidación de caché (no reportar éxito si KV falla)
  const saved = await replaceAllVehicles(updatedActiveList, { tenantSlug });
  if (saved.success) {
    for (const sold of soldForPhotoRelease) {
      // La fila ya salió de catalog_vehicles. Fotos y giro (cada versión) se borran ahora.
      await releaseVehiclePhotos(sold, "sold").catch((err) => {
        console.warn(`[GoogleSheetSync] No se pudieron borrar fotos de ${sold.slug}:`, err);
      });
    }
  }
  if (!saved.success) {
    return {
      success: false,
      message:
        saved.error ||
        "Sync Sheets calculó el inventario pero no se pudo persistir.",
      totalActive: updatedActiveList.length,
      newVehicles: newCount,
      soldVehicles: soldCount,
      updatedVehicles: updatedCount,
      sheetAccessGranted: true,
      antiWipeSkippedArchive: wipeGuard.skipArchive,
      skippedIncomplete,
      rowsRead: sheetVehicles.length,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    success: true,
    message: `Sincronización ${tenantSlug}: ${updatedActiveList.length} listos para vitrina, ${newCount} nuevos, ${soldCount} vendidos archivados, ${updatedCount} actualizados, ${skippedIncomplete} omitidos (preparación/sin precio/km).${wipeGuard.skipArchive ? ` Nota: ${wipeGuard.reason}` : ""}`,
    totalActive: updatedActiveList.length,
    newVehicles: newCount,
    soldVehicles: soldCount,
    updatedVehicles: updatedCount,
    sheetAccessGranted: true,
    antiWipeSkippedArchive: wipeGuard.skipArchive,
    skippedIncomplete,
    rowsRead: sheetVehicles.length,
    timestamp: new Date().toISOString(),
  };
}
