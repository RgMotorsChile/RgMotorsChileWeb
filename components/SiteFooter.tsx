import Link from "next/link";
import Logo from "./Logo";
import { COMPANY, whatsappLink } from "@/lib/company";

export default function SiteFooter() {
  return (
    <footer className="mt-0 border-t border-white/[0.08] bg-ink-950/80 backdrop-blur-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo size={50} />
          <p className="max-w-xs text-xs leading-relaxed text-white/45">
            Automotora en Puerto Montt. Vehículos seleccionados y atención en showroom.
          </p>
          <div className="space-y-1 text-[11px] leading-relaxed text-white/40">
            <p className="font-medium text-white/55">{COMPANY.legalName}</p>
            {COMPANY.rut ? <p>RUT {COMPANY.rut}</p> : null}
            <p>{COMPANY.address}</p>
            <p>{COMPANY.region}</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">Comprar</h4>
          <ul className="mt-4 space-y-2.5 text-xs text-white/50">
            <li>
              <Link href="/catalogo" className="transition-colors hover:text-white">
                Catálogo de vehículos
              </Link>
            </li>
            <li>
              <Link href="/comparador" className="transition-colors hover:text-white">
                Comparador de vehículos
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">Empresa</h4>
          <ul className="mt-4 space-y-2.5 text-xs text-white/50">
            <li>
              <Link href="/contacto" className="transition-colors hover:text-white">
                Contacto y ubicación
              </Link>
            </li>
            <li>
              <a
                href={whatsappLink("Hola RG Motors, quiero información.")}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white"
              >
                Atención vía WhatsApp
              </a>
            </li>
            <li>
              <Link href="/privacidad" className="transition-colors hover:text-white">
                Política de privacidad
              </Link>
            </li>
            <li>
              <Link href="/terminos" className="transition-colors hover:text-white">
                Términos de uso
              </Link>
            </li>
            <li>
              <Link href="/cookies" className="transition-colors hover:text-white">
                Política de cookies
              </Link>
            </li>
            <li>
              <Link href="/condiciones-reserva" className="transition-colors hover:text-white">
                Condiciones de prioridad
              </Link>
            </li>
            <li>
              <Link href="/aviso-credito" className="transition-colors hover:text-white">
                Aviso de crédito
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">Redes y Contacto</h4>
          <ul className="mt-4 space-y-2.5 text-xs text-white/50">
            <li className="font-semibold text-white/80">{COMPANY.phoneDisplay}</li>
            <li>{COMPANY.email}</li>
            <li>{COMPANY.address}</li>
            <li className="pt-1 text-[11px] text-white/35">{COMPANY.hours}</li>
          </ul>

          <div className="mt-4 flex items-center gap-3">
            <a
              href={COMPANY.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-white/45 transition hover:text-white"
              aria-label="Instagram de RG Motors"
            >
              Instagram
            </a>
            <span className="text-white/20">·</span>
            <a
              href={COMPANY.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-white/45 transition hover:text-white"
              aria-label={COMPANY.facebookLabel}
            >
              Facebook
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-white/40 sm:px-6">
          <span>
            © {new Date().getFullYear()} {COMPANY.legalName}
            {COMPANY.rut ? ` · RUT ${COMPANY.rut}` : ""} · Todos los derechos reservados
          </span>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacidad" className="transition-colors hover:text-white/70">
              Privacidad
            </Link>
            <Link href="/terminos" className="transition-colors hover:text-white/70">
              Términos
            </Link>
            <Link href="/cookies" className="transition-colors hover:text-white/70">
              Cookies
            </Link>
            <Link href="/aviso-credito" className="transition-colors hover:text-white/70">
              Aviso de crédito
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
