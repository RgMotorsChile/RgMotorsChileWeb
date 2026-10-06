import Link from "next/link";
import { COMPANY } from "@/lib/company";

const POINTS = [
  `Tasación sin costo en ${COMPANY.addressShort}`,
  "Publicamos con fotos reales y ficha clara",
  "Nos encargamos de la venta y los trámites",
];

/** Bloque "Consigna tu vehículo" (portada, ficha y catálogo). */
export default function ConsignaSection({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-labelledby="consigna-compact">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C9A84C]/90">¿Vendes tu auto?</p>
        <h2 id="consigna-compact" className="mt-2 text-base font-bold text-white">Consigna tu vehículo</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
          Lo tasamos, lo publicamos y lo vendemos por ti en Puerto Montt.
        </p>
        <Link
          href="/consigna"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/15 text-sm font-semibold text-white transition hover:border-white/35"
        >
          Consignar mi vehículo
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#12151e] to-[#0b0c11] px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8" aria-labelledby="consigna-home">
      <div className="min-w-0 max-w-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C9A84C]/90">Consignación</p>
        <h2 id="consigna-home" className="mt-2 font-display text-[1.45rem] font-semibold uppercase tracking-[0.04em] text-white sm:text-[1.75rem]">
          Consigna tu vehículo
        </h2>
        <ul className="mt-3 space-y-1.5 text-[13px] text-white/55 sm:text-sm">
          {POINTS.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-[#C9A84C]" aria-hidden>·</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="rg-cta-row sm:w-auto">
        <Link
          href="/consigna"
          className="rg-btn-primary inline-flex min-h-12 items-center justify-center rounded-xl px-6 py-3 text-sm font-bold text-white sm:min-h-11 sm:rounded-lg"
        >
          Consignar mi vehículo
        </Link>
      </div>
    </section>
  );
}
