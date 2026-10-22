/**
 * URL pública sin patente.
 * Formato: marca-modelo-versión-año + id corto. El id sale de un hash del
 * slug guardado (el de las fotos) y no es la patente.
 * El slug de almacenamiento no se reescribe: las fotos siguen en su ruta.
 */

import { legacyUrlLocked } from "./stockSucursal";

const PLATE_RE = /^[a-z]{2,4}\d{2,4}$/i;
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type SlugSource = {
  slug: string;
  brand: string;
  model: string;
  version?: string;
  year: number;
  plate?: string;
};

export function foldSlug(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function plateToken(vehicle: { slug?: string; plate?: string }): string {
  const fromField = String(vehicle.plate || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (fromField && PLATE_RE.test(fromField)) return fromField;
  const last = String(vehicle.slug || "").split("-").pop() || "";
  if (PLATE_RE.test(last)) return last.toLowerCase();
  return "";
}

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shortId(seed: string, plate: string): string {
  let salt = seed || "vehiculo";
  for (let attempt = 0; attempt < 6; attempt++) {
    let n = fnv1a(`rg-motors|${salt}|${plate}|${attempt}`);
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += ID_ALPHABET[n % ID_ALPHABET.length];
      n = Math.imul(n ^ (i + 17), 0x01000193) >>> 0;
    }
    const looksLikePlate = PLATE_RE.test(id);
    const leaksPlate = Boolean(plate) && (id.includes(plate) || plate.includes(id));
    if (!looksLikePlate && !leaksPlate) return id;
    salt = `${salt}#${attempt}`;
  }
  return "rgmoto";
}

function tokens(value: string): string[] {
  return foldSlug(value).split("-").filter(Boolean);
}

export function pathHasPlate(value: string): boolean {
  return String(value || "")
    .split(/[^a-z0-9]+/i)
    .some((part) => PLATE_RE.test(part));
}

export function plateInSlug(slug: string): string {
  const last = String(slug || "").split("-").pop() || "";
  return PLATE_RE.test(last) ? last.toLowerCase() : "";
}

export function publicVehicleSlug(vehicle: SlugSource): string {
  // a_confirmar conserva la URL de hoy. No hay 301 al slug sin patente.
  if (legacyUrlLocked(vehicle)) return vehicle.slug;
  const plate = plateInSlug(vehicle.slug);
  if (!plate) return vehicle.slug;

  const brand = tokens(vehicle.brand);
  const model = tokens(vehicle.model);
  const version = tokens(vehicle.version || "").filter(
    (token) =>
      token !== plate &&
      token !== String(vehicle.year) &&
      !brand.includes(token) &&
      !model.includes(token),
  );
  const parts = [...brand, ...model, ...version, vehicle.year ? String(vehicle.year) : []].flat();
  const base = parts.filter((token) => token && token !== plate).join("-") || "vehiculo";
  const id = shortId(vehicle.slug || base, plate);
  return `${base}-${id}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

export function slugMatchesVehicle(vehicle: SlugSource, requested: string): boolean {
  return vehicle.slug === requested || publicVehicleSlug(vehicle) === requested;
}

/** Quita la patente de un texto visible (título, alt, descripción). */
export function scrubPlate(text: string, plate?: string): string {
  const token = String(plate || "").replace(/[^a-z0-9]/gi, "");
  if (!token) return text;
  const spaced = token.length > 4 ? `${token.slice(0, -2)}\\s*${token.slice(-2)}` : token;
  return text
    .replace(new RegExp(spaced, "ig"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,·|])/g, "$1")
    .trim();
}
