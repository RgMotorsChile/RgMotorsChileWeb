import { COMPANY } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Cookies | RG Motors",
  description: "Información sobre el uso de cookies y tecnologías similares en el sitio de RG Motors.",
};

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-8 border-b border-white/[0.08] pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Política de Cookies</h1>
        <p className="mt-2 text-sm text-white/50">{COMPANY.legalName} · Sitio web</p>
      </div>

      <article className="apple-glass-card space-y-6 rounded-3xl p-6 text-sm leading-relaxed text-white/70 sm:p-8">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">1. Qué son las cookies</h2>
          <p>
            Las cookies son pequeños archivos que el sitio guarda en tu navegador para
            funcionar correctamente, recordar preferencias o entender cómo se usa la web.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">2. Cookies que usamos</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Esenciales:</strong> sesión de administración,
              seguridad y preferencia de consentimiento de cookies.
            </li>
            <li>
              <strong className="text-white">Medición (opcionales):</strong> origen de visita
              (por ejemplo campaña o referido) para mejorar atención comercial, y estadísticas
              de uso del sitio con Google Analytics (páginas visitadas y contactos iniciados).
              Se activan solo cuando aceptas cookies no esenciales.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">3. Cómo gestionarlas</h2>
          <p>
            Puedes aceptar solo cookies esenciales o todas desde el aviso del sitio, y también
            borrar o bloquear cookies desde la configuración de tu navegador. Si bloqueas
            cookies esenciales, algunas funciones (como el acceso admin) pueden dejar de
            funcionar.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-white">4. Más información</h2>
          <p>
            Ver también nuestra{" "}
            <Link href="/privacidad" className="text-brand-300 hover:underline">
              Política de Privacidad
            </Link>
            . Consultas:{" "}
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
