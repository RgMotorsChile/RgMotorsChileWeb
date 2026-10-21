/**
 * "Limpiar fotos sin uso" (admin): lista el store con `list`, junta en el
 * momento todas las referencias (Supabase completo vía admin_blob_url_refs,
 * KV de la app, código/public) y clasifica. Falla cerrado: si alguna fuente
 * de referencias no responde, no se propone ni se borra nada.
 */
import { createHash } from "node:crypto";
import { del, list } from "@vercel/blob";
import { createServerSupabase } from "@/lib/supabase/client";
import { readJson, readJsonOptional, writeJson } from "@/lib/server/db";
import { CODE_BLOB_REFS } from "@/lib/server/codeBlobRefs";
import {
  classifyBlobs,
  selectionFingerprint,
  summarize,
  type BlobItem,
  type Candidate,
  type CleanupCategory,
  CLEANUP_CATEGORIES,
} from "@/lib/server/blobCleanupCore";

/**
 * Archivos KV de la app que pueden contener URLs de fotos.
 * drive-photos-sync-state.json NO protege: es solo caché de descargas de Drive
 * (si el auto vuelve, el sync re-sube lo que falte, PR #23).
 * admin-credentials.json no se lee.
 */
const KV_FILES = [
  "vehicles.json",
  "sold_vehicles.json",
  "settings.json",
  "reservations.json",
  "trade-ins.json",
  "car_requests.json",
  "test-drives.json",
  "price_alerts.json",
  "notifications.json",
  "contact-messages.json",
  "leads.json",
];

const LOG_FILE = "blob-cleanup-log.json";
const BLOB_URL = /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^"'`\s)<>,\\]+/g;

export class CleanupAbort extends Error {}

async function listAllBlobs(): Promise<BlobItem[]> {
  const out: BlobItem[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 200; i++) {
    const page = await list({ cursor, limit: 1000 });
    for (const b of page.blobs) {
      out.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
    }
    if (!page.hasMore || !page.cursor) return out;
    cursor = page.cursor;
  }
  throw new CleanupAbort("El store tiene demasiados blobs para listarlos en una pasada.");
}

async function supabaseRefs(host: string): Promise<{ refs: string[]; slugs: string[] }> {
  const sb = createServerSupabase();
  const { data, error } = await sb.rpc("admin_blob_url_refs", { blob_host: host });
  if (error) throw new CleanupAbort(`No se pudieron leer las referencias de Supabase: ${error.message}`);
  const slugsRes = await sb.from("catalog_vehicles").select("slug");
  if (slugsRes.error) throw new CleanupAbort(`No se pudo leer catalog_vehicles: ${slugsRes.error.message}`);
  const refs = ((data as { url: string }[] | null) || []).map((r) => r.url);
  const slugs = (slugsRes.data || []).map((r: { slug: string }) => r.slug);
  if (slugs.length > 0 && refs.length === 0) {
    throw new CleanupAbort("Supabase no devolvió ninguna foto en uso; se cancela por seguridad.");
  }
  return { refs, slugs };
}

async function kvRefs(): Promise<string[]> {
  const out: string[] = [];
  for (const f of KV_FILES) {
    const data = await readJsonOptional<unknown>(f);
    if (data == null) continue;
    const text = JSON.stringify(data);
    out.push(...(text.match(BLOB_URL) || []));
  }
  return out;
}

async function sha(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex");
}

export async function computeCleanupPlan() {
  const blobs = await listAllBlobs();
  if (blobs.length === 0) return { candidates: [] as Candidate[], ...emptyPlan() };
  const host = new URL(blobs[0].url).host;
  const [sbr, kv] = await Promise.all([supabaseRefs(host), kvRefs()]);
  const cache = new Map<string, Promise<string>>();
  const hash = (u: string) => {
    if (!cache.has(u)) cache.set(u, sha(u));
    return cache.get(u)!;
  };
  const res = await classifyBlobs({
    blobs,
    referenced: [...sbr.refs, ...kv, ...CODE_BLOB_REFS],
    catalogSlugs: sbr.slugs,
    sameContent: async (a, b) => (await hash(a.url)) === (await hash(b.url)),
  });
  return { ...res, byCategory: summarize(res.candidates), fingerprint: selectionFingerprint(res.candidates) };
}

function emptyPlan() {
  return {
    protectedCounts: {},
    totals: { blobs: 0, bytes: 0 },
    byCategory: summarize([]),
    fingerprint: selectionFingerprint([]),
  };
}

export function pickCategories(cands: Candidate[], cats: string[]): Candidate[] {
  const set = new Set(cats.filter((c): c is CleanupCategory => (CLEANUP_CATEGORIES as string[]).includes(c)));
  return cands.filter((c) => set.has(c.category));
}

export type CleanupLogEntry = {
  at: string;
  categories: string[];
  count: number;
  bytes: number;
  items: { url: string; size: number; category: string; slug: string }[];
};

export async function deleteCandidates(sel: Candidate[], categories: string[]) {
  let deleted = 0;
  let bytes = 0;
  const done: Candidate[] = [];
  for (let i = 0; i < sel.length; i += 100) {
    const batch = sel.slice(i, i + 100);
    await del(batch.map((b) => b.url));
    deleted += batch.length;
    bytes += batch.reduce((s, b) => s + (b.size || 0), 0);
    done.push(...batch);
  }
  const log = await readJson<CleanupLogEntry[]>(LOG_FILE, []);
  log.unshift({
    at: new Date().toISOString(),
    categories,
    count: deleted,
    bytes,
    items: done.map((d) => ({ url: d.url, size: d.size, category: d.category, slug: d.slug })),
  });
  await writeJson(LOG_FILE, log.slice(0, 100));
  return { deleted, bytes };
}

export async function getCleanupLog(): Promise<CleanupLogEntry[]> {
  return readJson<CleanupLogEntry[]>(LOG_FILE, []);
}
