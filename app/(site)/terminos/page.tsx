import { COMPANY } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos de Uso | RG Motors",
  description: "Términos y condiciones de uso del sitio web y catálogo de RG Motors.",
};

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-8 border-b border-white/[0.08] pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Términos de Uso</h1>
        <p className="mt-2 text-sm text-white/50">
          Sitio web y catálogo de {COMPANY.legalName}
          {COMPANY.rut ? ` · RUT ${COMPANY.rut}` : ""}
        </p>
      </div>

      <article className="apple-glass-card space-y-6 rounded-3xl p-6 text-sm leading-relaxed text-white/70 sm:p-8">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">1. Aceptación</h2>
          <p>
            Al navegar o usar este sitio aceptas estos términos. Si no estás de acuerdo,
            te pedimos no utilizar los formularios ni servicios online.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">2. Identidad del responsable</h2>
          <p>
            El sitio es operado por <strong className="text-white">{COMPANY.legalName}</strong>
            {COMPANY.rut ? (
              <>
                , RUT <strong className="text-white">{COMPANY.rut}</strong>
              </>
            ) : null}
            , con domicilio en {COMPANY.address}, {COMPANY.region}. Contacto:{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-brand-300 hover:underline">
              {COMPANY.email}
            </a>{" "}
            · {COMPANY.phoneDisplay}.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">3. Información del catálogo</h2>
          <p>
            Las fichas de vehículos (precios, kilometraje, equipamiento, disponibilidad y
            fotografías) son referenciales y pueden cambiar sin previo aviso. La
            disponibilidad se confirma únicamente con el equipo comercial de {COMPANY.name}.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">4. Vehículos usados y garantía</h2>
          <p>
            Los vehículos usados se comercializan en el estado inspeccionado al momento de la
            venta. Salvo pacto escrito distinto,{" "}
            <strong className="text-white">
              {COMPANY.name} no ofrece garantía mecánica postventa
            </strong>
            . Te recomendamos revisar la unidad en persona y la documentación antes de comprar.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">5. Solicitudes online</h2>
          <p>
            Los formularios de prioridad sobre una unidad, tasación, prueba de manejo
            o contacto constituyen una solicitud de atención, no un contrato de compraventa ni
            una reserva pagada, salvo confirmación expresa por escrito o en sucursal. Ver{" "}
            <Link href="/condiciones-reserva" className="text-brand-300 hover:underline">
              condiciones de solicitud de prioridad
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">6. Financiamiento</h2>
          <p>
            {COMPANY.name} comercializa el vehículo. El crédito, si se otorga, es evaluado y
            otorgado por una entidad financiera. Cualquier estimación de cuota es
            referencial. Ver{" "}
            <Link href="/aviso-credito" className="text-brand-300 hover:underline">
              Aviso de Crédito
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">7. Uso correcto</h2>
          <p>
            Te comprometes a entregar datos veraces y a no usar el sitio para spam, fraude
            o actividades ilícitas. Nos reservamos el derecho de rechazar solicitudes
            abusivas o incompletas.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">8. Propiedad intelectual</h2>
          <p>
            Marcas, textos, diseño y fotografías del sitio pertenecen a {COMPANY.name} o a
            sus licenciantes. Queda prohibida su reproducción no autorizada con fines
            comerciales. Marcas de terceros (fabricantes, Autofact, etc.) pertenecen
            a sus respectivos titulares.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">9. Limitación</h2>
          <p>
            En la medida permitida por la ley, {COMPANY.name} no responde por
            interrupciones del servicio web, errores tipográficos o decisiones de compra
            basadas únicamente en información publicada online.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">10. Ley aplicable</h2>
          <p>
            Estos términos se rigen por las leyes de la República de Chile. Para controversias
            derivadas del uso del sitio, serán competentes los tribunales de Puerto Montt,
            sin perjuicio de los derechos del consumidor ante SERNAC u otras instancias
            legales.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">11. Contacto</h2>
          <p>
            Consultas:{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-brand-300 hover:underline">
              {COMPANY.email}
            </a>{" "}
            ·{" "}
            <Link href="/contacto" className="text-brand-300 hover:underline">
              Página de contacto
            </Link>
            . Última actualización: septiembre 2026.
          </p>
        </section>
      </article>
    </main>
  );
}
