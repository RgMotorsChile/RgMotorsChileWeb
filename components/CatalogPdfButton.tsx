"use client";

import { useState } from "react";
import type { Vehicle } from "@/lib/vehicles";

export default function CatalogPdfButton({
  vehicles,
  filterSummary = "Catálogo completo",
}: {
  vehicles: Vehicle[];
  filterSummary?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (loading || vehicles.length === 0) return;
    setLoading(true);
    try {
      // Siempre desde stock vivo del servidor (se actualiza con el catálogo)
      const slugs = vehicles.map((v) => v.slug).filter(Boolean);
      const qs = new URLSearchParams();
      if (slugs.length) qs.set("slugs", slugs.join(","));
      const res = await fetch(`/api/catalog/pdf?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catalogo-rg-motors-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error("Error generando el PDF:", e);
      alert(
        e instanceof Error
          ? `No se pudo generar el PDF: ${e.message}`
          : "No se pudo generar el PDF. Intenta nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={loading || vehicles.length === 0}
      className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-[#1a3f86] disabled:text-white"
      title={filterSummary}
    >
      {loading ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Generando PDF…
        </>
      ) : (
        <>
          <span aria-hidden>⬇</span>
          Descargar catálogo PDF
          <span className="hidden w-10 text-right text-xs font-normal tabular-nums text-white/90 sm:inline">
            ({vehicles.length})
          </span>
        </>
      )}
    </button>
  );
}
