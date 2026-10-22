/**
 * Tabla maestra de sucursal. La fuente es docs/stock-sucursal.csv
 * (el mismo texto que STOCK_SUCURSAL_CSV). Si las fuentes chocan, la fila
 * queda en a_confirmar y este dominio no la mueve.
 */
import { STOCK_SUCURSAL_CSV } from "./stockSucursalCsv";

export type StockSite = "rg" | "uc" | "salgado" | "a_confirmar";

export type StockRow = {
  patente: string;
  marca_modelo_anio: string;
  sitio: StockSite;
  fuente: string;
  url_rg: string;
  url_uc: string;
  url_salgado: string;
  nota: string;
};

const PLATE_RE = /^[a-z]{2,4}\d{2,4}$/i;
const SITES = new Set<StockSite>(["rg", "uc", "salgado", "a_confirmar"]);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

export function parseStockCsv(text: string): StockRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const index = new Map(header.map((name, i) => [name.trim(), i]));
  const cell = (cols: string[], name: string) => (cols[index.get(name) ?? -1] ?? "").trim();
  return body.map((cols) => {
    const sitio = cell(cols, "sitio");
    if (!SITES.has(sitio as StockSite)) {
      throw new Error(`sitio inválido en stock-sucursal: ${sitio || "(vacío)"}`);
    }
    return {
      patente: cell(cols, "patente").replace(/[^a-z0-9]/gi, "").toUpperCase(),
      marca_modelo_anio: cell(cols, "marca_modelo_anio"),
      sitio: sitio as StockSite,
      fuente: cell(cols, "fuente"),
      url_rg: cell(cols, "url_rg"),
      url_uc: cell(cols, "url_uc"),
      url_salgado: cell(cols, "url_salgado"),
      nota: cell(cols, "nota"),
    };
  });
}

const ROWS = parseStockCsv(STOCK_SUCURSAL_CSV);
const BY_PLATE = new Map(ROWS.filter((row) => row.patente).map((row) => [row.patente, row]));

export function stockRows(): readonly StockRow[] {
  return ROWS;
}

export function plateKeyOf(vehicle: { slug?: string; plate?: string }): string {
  const fromField = String(vehicle.plate || "").replace(/[^a-z0-9]/gi, "");
  if (PLATE_RE.test(fromField)) return fromField.toUpperCase();
  const last = String(vehicle.slug || "").split("-").pop() || "";
  if (PLATE_RE.test(last)) return last.toUpperCase();
  return "";
}

export function stockRowFor(vehicle: { slug?: string; plate?: string }): StockRow | null {
  const key = plateKeyOf(vehicle);
  return key ? BY_PLATE.get(key) ?? null : null;
}

/** a_confirmar no cambia la URL de hoy: sin 301, sin 410 y sigue en el sitemap. */
export function legacyUrlLocked(vehicle: { slug?: string; plate?: string }): boolean {
  return stockRowFor(vehicle)?.sitio === "a_confirmar";
}

export function offsiteUrlFor(vehicle: { slug?: string; plate?: string }): string | null {
  const row = stockRowFor(vehicle);
  if (!row) return null;
  if (row.sitio === "uc") return row.url_uc || null;
  if (row.sitio === "salgado") return row.url_salgado || null;
  return null;
}
