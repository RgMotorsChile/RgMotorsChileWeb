"use client";

import { useMemo, useState } from "react";
import {
  CLEANUP_CATEGORIES,
  selectionFingerprint,
  type Candidate,
  type CleanupCategory,
} from "@/lib/server/blobCleanupCore";

type Preview = {
  totals: { blobs: number; bytes: number };
  byCategory: Record<CleanupCategory, { count: number; bytes: number }>;
  protectedCounts: Record<string, { count: number; bytes: number }>;
  candidates: Candidate[];
};

const LABEL: Record<CleanupCategory, string> = {
  vendidos: "Autos vendidos o borrados",
  duplicados: "Duplicados exactos",
  antiguos: "Fotos antiguas de autos que siguen publicados",
};

const PROTECTED_LABEL: Record<string, string> = {
  en_uso: "En uso en alguna ficha o tabla",
  fuera_de_fotos_de_autos: "Fuera de las fotos de autos",
  tour_360: "Tour 360",
  reciente: "Subidas hace menos de 48 h",
  foto_reemplazada: "Fotos reemplazadas",
  original_de_reemplazo: "Originales guardados de fotos reemplazadas",
};

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function BlobCleanupPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [cats, setCats] = useState<Set<CleanupCategory>>(new Set(["vendidos", "duplicados"]));

  const selected = useMemo(
    () => (preview ? preview.candidates.filter((c) => cats.has(c.category)) : []),
    [preview, cats],
  );
  const selBytes = selected.reduce((s, c) => s + (c.size || 0), 0);

  async function load() {
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const r = await fetch("/api/admin/blob-cleanup", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      setPreview(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!preview || selected.length === 0) return;
    const ok = window.confirm(
      `Se borrarán ${selected.length} fotos (${mb(selBytes)}). Esto no se puede deshacer. ¿Continuar?`,
    );
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/blob-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: Array.from(cats),
          fingerprint: selectionFingerprint(selected),
          confirm: "BORRAR",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      setDone(`Listo: se borraron ${j.deleted} fotos y se liberaron ${mb(j.bytes)}.`);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/80">
      <h3 className="mb-1 text-base font-bold text-white">Limpiar fotos sin uso</h3>
      <p className="mb-3 text-xs text-white/50">
        Revisa el almacenamiento de fotos y muestra las que ninguna ficha, tabla ni tour usa. No borra nada
        hasta que confirmes. Los originales de fotos reemplazadas siempre se conservan.
      </p>
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {loading ? "Revisando…" : "Limpiar fotos sin uso"}
      </button>
      {error && <p className="mt-3 text-xs font-bold text-red-400">{error}</p>}
      {done && <p className="mt-3 text-xs font-bold text-emerald-400">{done}</p>}
      {preview && (
        <div className="mt-4 space-y-3" data-testid="blob-cleanup-preview">
          <p className="text-xs text-white/60">
            Almacenamiento total: {preview.totals.blobs} archivos, {mb(preview.totals.bytes)}.
          </p>
          <div className="space-y-1">
            {CLEANUP_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={cats.has(c)}
                  onChange={(e) => {
                    const n = new Set(cats);
                    if (e.target.checked) n.add(c);
                    else n.delete(c);
                    setCats(n);
                  }}
                />
                {LABEL[c]}: {preview.byCategory[c].count} ({mb(preview.byCategory[c].bytes)})
              </label>
            ))}
          </div>
          <details className="text-xs text-white/50">
            <summary>Protegidas (no se borran)</summary>
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(preview.protectedCounts).map(([k, v]) => (
                <li key={k}>
                  {PROTECTED_LABEL[k] || k}: {v.count} ({mb(v.bytes)})
                </li>
              ))}
            </ul>
          </details>
          <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-[11px]">
              <tbody>
                {selected.map((c) => (
                  <tr key={c.url} className="border-b border-white/5">
                    <td className="p-1">
                      <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                        {c.pathname.replace("cars/uploads/", "")}
                      </a>
                    </td>
                    <td className="p-1 whitespace-nowrap">{mb(c.size)}</td>
                    <td className="p-1 text-white/50">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={loading || selected.length === 0}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Borrar {selected.length} fotos ({mb(selBytes)})
          </button>
        </div>
      )}
    </div>
  );
}
