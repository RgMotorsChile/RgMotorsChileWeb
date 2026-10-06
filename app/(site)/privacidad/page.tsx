import { COMPANY } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad | RG Motors",
  description: "Política de privacidad conforme a la Ley N° 19.628 sobre protección de la vida privada.",
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-8 border-b border-white/[0.08] pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Política de Privacidad</h1>
        <p className="mt-2 text-sm text-white/50">
          {COMPANY.legalName} · Ley N° 19.628 sobre Protección de la Vida Privada
        </p>
      </div>

      <article className="apple-glass-card space-y-6 rounded-3xl p-6 text-sm leading-relaxed text-white/70 sm:p-8">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">1. Responsable</h2>
          <p>
            El responsable del tratamiento de los datos personales es{" "}
            <strong className="text-white">{COMPANY.legalName}</strong>
            {COMPANY.rut ? (
              <>
                {" "}
                (RUT <strong className="text-white">{COMPANY.rut}</strong>)
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
          <h2 className="text-base font-bold text-white">2. Datos que recopilamos</h2>
          <p>
            Podemos recopilar nombre, RUT, teléfono, correo electrónico, datos del vehículo de
            interés, información de financiamiento que nos entregues (renta declarada, pie, plazo),
            preferencias de visita o prueba de manejo, y mensajes que nos envíes por
            formularios o WhatsApp, cuando tú los entregas voluntariamente. También podemos
            registrar datos técnicos de navegación y origen de visita según tu consentimiento
            de cookies (ver{" "}
            <Link href="/cookies" className="text-brand-300 hover:underline">
              Política de Cookies
            </Link>
            ).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">3. Finalidad</h2>
          <p>
            Usamos tus datos para atender consultas, gestionar solicitudes de prioridad sobre
            unidades, tasación o financiamiento, coordinar visitas o pruebas de manejo,
            contactarte comercialmente en relación con vehículos de nuestro inventario y
            mejorar la atención. No vendemos bases de datos a terceros ajenos a la operación
            comercial.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">4. Encargados y transferencias</h2>
          <p>
            Podemos compartir datos estrictamente necesarios con entidades financieras
            asociadas cuando solicitas una evaluación de crédito, y con
            proveedores técnicos que alojan u operan el sitio (hosting, infraestructura cloud),
            bajo deber de confidencialidad y solo para las finalidades indicadas.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">5. Derechos ARCO</h2>
          <p>
            Conforme a la Ley N° 19.628, puedes solicitar acceso, rectificación, cancelación u
            oposición al tratamiento de tus datos escribiendo a{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-brand-300 hover:underline">
              {COMPANY.email}
            </a>
            , indicando “Ejercicio derechos ARCO” en el asunto. Responderemos en plazos
            razonables conforme a la ley.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">6. Conservación y seguridad</h2>
          <p>
            Conservamos la información el tiempo necesario para las finalidades indicadas,
            seguimiento comercial razonable y obligaciones legales. Aplicamos medidas técnicas
            y organizativas razonables para proteger los datos frente a accesos no autorizados.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">7. Actualizaciones</h2>
          <p>
            Esta política puede actualizarse. La versión vigente se publica en este sitio.
            Última actualización: septiembre 2026.
          </p>
        </section>
      </article>
    </main>
  );
}
