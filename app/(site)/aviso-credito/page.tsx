import { COMPANY } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso de Crédito | RG Motors",
  description:
    "Aviso legal sobre financiamiento automotriz y estimaciones de cuota referenciales (Autofin / SERNAC).",
};

export default function AvisoCreditoPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-8 border-b border-white/[0.08] pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Aviso de Crédito</h1>
        <p className="mt-2 text-sm text-white/50">
          Financiamiento automotriz · Ley N° 19.496 (SERNAC)
        </p>
      </div>

      <article className="apple-glass-card space-y-6 rounded-3xl p-6 text-sm leading-relaxed text-white/70 sm:p-8">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">1. Estimaciones de cuota</h2>
          <p>
            Cuando un asesor de RG Motors entrega una estimación de cuota, es referencial. El
            crédito lo otorga <strong className="text-white">Autofin</strong>; RG Motors
            comercializa el vehículo. No constituye oferta vinculante ni pre-aprobación. Las
            condiciones definitivas las confirma Autofin.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">2. Evaluación de la financiera</h2>
          <p>
            La tasa, el pie mínimo, el plazo, los gastos operacionales y la aprobación
            final dependen de la evaluación comercial y crediticia de Autofin (u otra
            entidad), del historial del solicitante y de las condiciones vigentes al
            momento de la operación.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">3. Protección al consumidor</h2>
          <p>
            Conforme a la Ley N° 19.496 sobre Protección de los Derechos de los
            Consumidores, tienes derecho a información veraz y oportuna. Ante dudas o
            reclamos puedes contactarnos o acudir a SERNAC (
            <a
              href="https://www.sernac.cl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-300 hover:underline"
            >
              www.sernac.cl
            </a>
            ).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">4. Rol de {COMPANY.name}</h2>
          <p>
            {COMPANY.name} actúa como intermediario comercial de vehículos. El crédito, si
            se otorga, es un contrato entre el cliente y la financiera. Te recomendamos
            revisar siempre la documentación oficial antes de firmar.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">5. Más información</h2>
          <p>
            Contacto:{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-brand-300 hover:underline">
              {COMPANY.email}
            </a>
            . Última actualización: octubre 2026.
          </p>
        </section>
      </article>
    </main>
  );
}
