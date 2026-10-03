import type { Metadata } from "next";
import ConsignaForm from "@/components/ConsignaForm";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Consigna tu vehículo | RG Motors Puerto Montt",
  description:
    "Consigna tu auto o camioneta en RG Motors: tasación sin costo, fotos reales y venta gestionada en Puerto Montt.",
  alternates: { canonical: "https://www.rgmotorschile.cl/consigna" },
};

const STEPS = [
  ["01", "Déjanos tus datos", "Marca, modelo, año y kilometraje. Te contactamos en horario hábil."],
  ["02", "Tasación en patio", `Revisamos el vehículo en ${COMPANY.addressShort}.`],
  ["03", "Publicamos y vendemos", "Fotos reales, ficha clara y atención a compradores por ti."],
];

export default function ConsignaPage() {
  return (
    <main className="mx-auto w-full max-w-5xl overflow-x-clip px-4 py-10 sm:px-6 sm:py-14">
      <header className="border-b border-white/[0.08] pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C9A84C]/90">Consignación</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Consigna tu vehículo</h1>
        <p className="mt-2 max-w-xl text-sm text-white/55">
          Vende tu auto sin perder tiempo: lo tasamos, lo publicamos y lo mostramos a compradores en Puerto Montt.
        </p>
      </header>

      <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <ConsignaForm />
        </div>
        <ol className="min-w-0 space-y-3">
          {STEPS.map(([n, title, text]) => (
            <li key={n} className="rounded-2xl border border-white/[0.08] bg-[#0e1016] px-5 py-4">
              <span className="font-display text-sm tracking-[0.18em] text-[#C9A84C]/80">{n}</span>
              <p className="mt-1 text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-white/50">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
