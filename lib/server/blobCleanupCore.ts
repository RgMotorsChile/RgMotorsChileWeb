/**
 * "Limpiar fotos sin uso": lógica pura (sin red) para decidir qué blobs del
 * store de fotos se pueden borrar. Todo lo dudoso se PROTEGE.
 */
import { REPLACED_SUFFIX } from "@/lib/server/photoReplace";

export type BlobItem = { url: string; pathname: string; size: number; uploadedAt: string | Date };

export type CleanupCategory = "vendidos" | "duplicados" | "antiguos";
export const CLEANUP_CATEGORIES: CleanupCategory[] = ["vendidos", "duplicados", "antiguos"];

export type ProtectReason =
  | "en_uso"
  | "fuera_de_fotos_de_autos"
  | "tour_360"
  | "reciente"
  | "foto_reemplazada"
  | "original_de_reemplazo";

export type Candidate = BlobItem & { category: CleanupCategory; slug: string; reason: string };

/** Solo se consideran fotos subidas de autos. Todo lo demás se protege. */
export const CLEANUP_PREFIX = "cars/uploads/";
/** Blobs subidos hace menos de esto se protegen (el sync puede estar guardándolos). */
export const RECENT_MS = 48 * 60 * 60 * 1000;

/** Normaliza una URL o ruta a pathname sin query ni slash inicial. */
export function toPathname(u: string): string {
  let s = String(u || "").trim();
  try {
    if (/^https?:\/\//i.test(s)) s = new URL(s).pathname;
  } catch {
    /* ruta relativa */
  }
  s = s.split("?")[0].split("#")[0];
  try {
    s = decodeURIComponent(s);
  } catch {
    /* tal cual */
  }
  return s.replace(/^\/+/, "");
}

function stemOf(pathname: string): string {
  const dot = pathname.lastIndexOf(".");
  const slash = pathname.lastIndexOf("/");
  return dot > slash ? pathname.slice(0, dot) : pathname;
}

export function slugOf(pathname: string): string {
  if (!pathname.startsWith(CLEANUP_PREFIX)) return "";
  return pathname.slice(CLEANUP_PREFIX.length).split("/")[0] || "";
}

export function protectReason(
  blob: BlobItem,
  referenced: Set<string>,
  replacedStems: Set<string>,
  now: number,
): ProtectReason | null {
  const p = toPathname(blob.pathname || blob.url);
  if (referenced.has(p)) return "en_uso";
  if (!p.startsWith(CLEANUP_PREFIX) || !slugOf(p) || p.split("/").length < 4) return "fuera_de_fotos_de_autos";
  if (/(^|\/)(spin|360|tour)(\/|[-_])/i.test(p) || /manifest\.json$/i.test(p)) return "tour_360";
  const up = new Date(blob.uploadedAt).getTime();
  if (!Number.isFinite(up) || now - up < RECENT_MS) return "reciente";
  const stem = stemOf(p);
  if (REPLACED_SUFFIX.test(stem)) return "foto_reemplazada";
  if (replacedStems.has(stem)) return "original_de_reemplazo";
  return null;
}

/** Stems base (sin __rN) de todo blob o referencia que tenga sufijo de reemplazo. */
export function collectReplacedStems(paths: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of paths) {
    const stem = stemOf(toPathname(raw));
    if (REPLACED_SUFFIX.test(stem)) out.add(stem.replace(REPLACED_SUFFIX, ""));
  }
  return out;
}

export type ClassifyInput = {
  blobs: BlobItem[];
  /** URLs/rutas referenciadas (Supabase, KV, código, public). */
  referenced: Iterable<string>;
  /** Slugs que existen hoy en catalog_vehicles (cualquier tenant/estado). */
  catalogSlugs: Iterable<string>;
  now?: number;
  /** Compara contenido real (hash) de dos blobs; solo se llama con mismo tamaño. */
  sameContent?: (a: BlobItem, b: BlobItem) => Promise<boolean>;
};

export type ClassifyResult = {
  candidates: Candidate[];
  protectedCounts: Record<ProtectReason, { count: number; bytes: number }>;
  totals: { blobs: number; bytes: number };
};

export async function classifyBlobs(input: ClassifyInput): Promise<ClassifyResult> {
  const now = input.now ?? Date.now();
  const referenced = new Set<string>();
  for (const r of input.referenced) {
    const p = toPathname(r);
    if (p) referenced.add(p);
  }
  const slugs = new Set(Array.from(input.catalogSlugs, (s) => String(s || "").trim()).filter(Boolean));
  const replacedStems = collectReplacedStems([...input.blobs.map((b) => b.pathname), ...referenced]);

  const protectedCounts = {} as ClassifyResult["protectedCounts"];
  const usedBySizeAndSlug = new Map<string, BlobItem[]>();
  const free: BlobItem[] = [];
  let bytes = 0;
  for (const b of input.blobs) {
    bytes += b.size || 0;
    const reason = protectReason(b, referenced, replacedStems, now);
    if (reason) {
      const c = (protectedCounts[reason] ||= { count: 0, bytes: 0 });
      c.count++;
      c.bytes += b.size || 0;
      if (reason === "en_uso") {
        const k = `${slugOf(toPathname(b.pathname))}|${b.size}`;
        const arr = usedBySizeAndSlug.get(k) || [];
        arr.push(b);
        usedBySizeAndSlug.set(k, arr);
      }
    } else free.push(b);
  }

  const candidates: Candidate[] = [];
  for (const b of free) {
    const p = toPathname(b.pathname);
    const slug = slugOf(p);
    if (!slugs.has(slug)) {
      candidates.push({ ...b, slug, category: "vendidos", reason: "el auto ya no existe en el catálogo (vendido o borrado)" });
      continue;
    }
    let dupOf: BlobItem | undefined;
    if (input.sameContent && b.size > 0) {
      for (const used of usedBySizeAndSlug.get(`${slug}|${b.size}`) || []) {
        if (await input.sameContent(b, used).catch(() => false)) {
          dupOf = used;
          break;
        }
      }
    }
    if (dupOf) {
      candidates.push({ ...b, slug, category: "duplicados", reason: `copia idéntica de ${toPathname(dupOf.pathname)} (en uso)` });
    } else {
      candidates.push({ ...b, slug, category: "antiguos", reason: "el auto sigue en catálogo pero esta foto ya no aparece en su ficha" });
    }
  }
  candidates.sort((a, b) => a.pathname.localeCompare(b.pathname));
  return { candidates, protectedCounts, totals: { blobs: input.blobs.length, bytes } };
}

export function summarize(cands: Candidate[]) {
  const out = Object.fromEntries(CLEANUP_CATEGORIES.map((c) => [c, { count: 0, bytes: 0 }])) as Record<
    CleanupCategory,
    { count: number; bytes: number }
  >;
  for (const c of cands) {
    out[c.category].count++;
    out[c.category].bytes += c.size || 0;
  }
  return out;
}

/** Huella estable de una selección, para que el borrado coincida con la vista previa. */
export function selectionFingerprint(cands: Candidate[]): string {
  const s = cands.map((c) => `${toPathname(c.pathname)}:${c.size}`).sort().join("\n");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${cands.length}-${(h >>> 0).toString(16)}`;
}
