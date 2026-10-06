"use client";

import Link from "next/link";
import { whatsappLink } from "@/lib/company";

const PILLARS = [
  {
    n: "01",
    title: "Inspección 150 puntos",
    desc: "Revisamos cada unidad antes de publicarla. Se vende en el estado inspeccionado; no ofrecemos garantía mecánica postventa.",
  },
  {
    n: "02",
    title: "Informe Autofact",
    desc: "Dominio, kilometraje y antecedentes al día: sin deudas ni multas que te sorprendan al comprar.",
  },
  {
    n: "03",
    title: "Entrega en patio",
    desc: "Visita, prueba de manejo y retiro en Av. Cardonal, Puerto Montt, con asesoría de punta a punta.",
  },
];

export default function AppleCareTrustSection() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.07] bg-[#08090d]">
      {/* Ambiente sutil */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(23,58,121,0.18),transparent_55%),radial-gradient(ellipse_at_90%_100%,rgba(201,168,76,0.06),transparent_45%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        {/* Transparencia */}
        <div>
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-gradient-to-r from-[#C9A84C] to-transparent" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C9A84C]/90">
              Transparencia
            </p>
          </div>
          <h2 className="mt-4 max-w-lg font-display text-[1.85rem] font-semibold uppercase leading-[1.1] tracking-[0.03em] text-white sm:text-[2.25rem]">
            Claridad en cada
            <br />
            etapa de la compra
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/45">
            Sabes qué estás comprando: inspección, papeles y entrega en un solo lugar.
          </p>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
            {PILLARS.map((p) => (
              <article
                key={p.n}
                className="bg-[#0c0d12] px-6 py-7 transition duration-300 hover:bg-[#101219] sm:px-7 sm:py-8"
              >
                <p className="font-display text-sm font-medium tracking-[0.2em] text-[#C9A84C]/75">
                  {p.n}
                </p>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-white">
                  {p.title}
                </h3>
                <p className="mt-3 text-[13px] leading-relaxed text-white/48">{p.desc}</p>
              </article>
            ))}
          </div>
        </div>

        {/* Cierre CTA — sin hueco vacío */}
        <div className="mt-14 overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-brand-700/35 via-[#12151d] to-[#08090d] sm:mt-16">
          <div className="relative px-6 py-10 text-center sm:px-12 sm:py-12">
            <div
              className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl"
              aria-hidden
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-200/80">
              Siguiente paso
            </p>
            <h2 className="relative mt-3 font-display text-[clamp(1.35rem,6vw,1.7rem)] font-semibold uppercase tracking-[0.04em] text-white sm:text-[2.1rem]">
              ¿Listo para tu próximo vehículo?
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-white/55 sm:text-sm">
              Explora el stock, agenda una visita o escribe a un asesor. Te acompañamos en Puerto
              Montt.
            </p>
            <div className="rg-cta-row relative mx-auto mt-8 max-w-md sm:max-w-none sm:justify-center">
              <Link
                href="/catalogo"
                className="rg-btn-primary inline-flex min-h-12 items-center justify-center rounded-xl px-7 py-3.5 text-sm font-bold text-white sm:min-h-11 sm:rounded-lg"
              >
                Explorar catálogo
              </Link>
              <a
                href={whatsappLink("Hola RG Motors, quiero información sobre un vehículo.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/[0.06] sm:min-h-11 sm:rounded-lg"
              >
                Hablar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
