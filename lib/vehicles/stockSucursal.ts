/**
 * Tabla maestra de sucursal. La fuente es docs/stock-sucursal.csv
 * (el mismo texto que STOCK_SUCURSAL_CSV).
 * sitio junta la sucursal de la celda UBICACION con cada pestaña donde está la patente.
 * CARDONAL y RG MOTORS son rg. Patio Salgado es salgado. UNI CHILE es uc.
 * Si incluye rg, la ficha sigue en este dominio. 410 solo cuando ninguna fuente la pone en RG.
 * a_confirmar queda solo cuando no hay patente y no se puede afirmar que sea el mismo auto.
 */
import { STOCK_SUCURSAL_CSV } from "./stockSucursalCsv";

export type StockToken = "rg" | "uc" | "salgado";

export type StockRow = {
  patente: string;
  marca_modelo_anio: string;
  sitio: string;
  fuente: string;
  url_rg: string;
  url_uc: string;
  url_salgado: string;
  nota: string;
};

const PLATE_RE = /^[a-z]{2,4}\d{2,4}$/i;
const TOKENS = new Set<StockToken>(["rg", "uc", "salgado"]);

export function stockTokens(sitio: string): StockToken[] {
  if (!sitio || sitio === "a_confirmar") return [];
  return sitio.split("+").filter((part): part is StockToken => TOKENS.has(part as StockToken));
}

function validSitio(sitio: string): boolean {
  if (sitio === "a_confirmar") return true;
  const parts = sitio.split("+");
  return parts.length > 0 && parts.every((part) => TOKENS.has(part as StockToken)) && new Set(parts).size === parts.length;
}

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
    if (!validSitio(sitio)) {
      throw new Error(`sitio inválido en stock-sucursal: ${sitio || "(vacío)"}`);
    }
    return {
      patente: cell(cols, "patente").replace(/[^a-z0-9]/gi, "").toUpperCase(),
      marca_modelo_anio: cell(cols, "marca_modelo_anio"),
      sitio,
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

export function listedOnRg(vehicle: { slug?: string; plate?: string }): boolean | null {
  const row = stockRowFor(vehicle);
  if (!row || row.sitio === "a_confirmar") return null;
  return stockTokens(row.sitio).includes("rg");
}

/** 301 a otro sitio solo si ninguna fuente (UBICACION o pestaña) pone la patente en RG. */
export function offsiteUrlFor(vehicle: { slug?: string; plate?: string }): string | null {
  const row = stockRowFor(vehicle);
  if (!row || row.sitio === "a_confirmar") return null;
  const tokens = stockTokens(row.sitio);
  if (tokens.includes("rg")) return null;
  if (tokens.includes("uc") && row.url_uc) return row.url_uc;
  if (tokens.includes("salgado") && row.url_salgado) return row.url_salgado;
  return null;
}
