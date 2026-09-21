"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import Logo from "./Logo";
import { COMPANY, whatsappLink } from "@/lib/company";
import TradeInModal from "./TradeInModal";
import CarRequestModal from "./CarRequestModal";

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/simulador", label: "Financiamiento" },
  { href: "/comparador", label: "Comparador" },
  { href: "/contacto", label: "Contacto" },
];

/** Píxeles de scroll para pasar a negro sólido en Inicio. */
const HOME_SOLID_AFTER_PX = 24;

function getScrollY() {
  return window.scrollY;
}

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange, { passive: true });
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

function getScrolledSnapshot() {
  return getScrollY() > HOME_SOLID_AFTER_PX;
}

/** SSR + primer paint: nunca “scrolleado” → transparente en Inicio. */
function getScrolledServerSnapshot() {
  return false;
}

function useScrolledPast() {
  return useSyncExternalStore(
    subscribeScroll,
    getScrolledSnapshot,
    getScrolledServerSnapshot,
  );
}

function normalizePathname(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length > 1 && value.endsWith("/")) return value.slice(0, -1);
  return value;
}

/**
 * En Next 16, usePathname() en el layout cliente puede venir vacío/null en el SSR de `/`
 * (el HTML de prod salía sticky + negro con ningún nav activo). Tratar vacío como Inicio.
 */
function isHomePath(pathname: string | null | undefined) {
  const normalized = normalizePathname(pathname);
  return !pathname || normalized === "" || normalized === "/";
}

export default function SiteHeader() {
  const pathname = usePathname();
  const scrolledPast = useScrolledPast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tradeInOpen, setTradeInOpen] = useState(false);
  const [carRequestOpen, setCarRequestOpen] = useState(false);

  const path = normalizePathname(pathname) || "/";

  const isActive = (href: string) => {
    const target = normalizePathname(href);
    return target === "/"
      ? isHomePath(pathname)
      : path === target || path.startsWith(`${target}/`);
  };

  const isHome = isHomePath(pathname);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const goHomeTop = () => {
    if (!isHome) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Inicio + arriba + menú cerrado → transparente sobre el hero.
  const homeFloating = isHome && !scrolledPast && !mobileMenuOpen;

  return (
    <>
      <header
        data-home-floating={homeFloating ? "true" : "false"}
        className={`z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ease-out ${
          isHome ? "fixed inset-x-0 top-0" : "sticky top-0"
        } ${
          homeFloating
            ? "border-b border-transparent bg-transparent shadow-none backdrop-blur-none"
            : "border-b border-white/[0.08] bg-[#06070a]"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-6 sm:px-6 sm:py-3.5">
          <Link
            href="/"
            onClick={goHomeTop}
            className="shrink-0 transition duration-300 hover:opacity-90 active:scale-[0.98]"
          >
            <Logo size={44} className="sm:hidden" />
            <Logo size={52} className="hidden sm:block" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={item.href === "/" ? goHomeTop : undefined}
                  className={`relative rounded-full px-3.5 py-2 text-[13px] font-medium tracking-wide transition-colors duration-300 ${
                    active ? "text-white" : "text-white/65 hover:text-white"
                  }`}
                >
                  {item.label}
                  <span
                    className={`absolute inset-x-3.5 -bottom-0.5 h-px origin-left bg-brand-400 transition-transform duration-300 ${
                      active ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={whatsappLink("Hola RG Motors, quiero información.")}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#25D366]/35 bg-[#25D366]/15 text-[#25D366] transition hover:bg-[#25D366]/25 md:hidden"
              aria-label="WhatsApp RG Motors"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden>
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
            </a>
            <a
              href={whatsappLink("Hola RG Motors, quiero información.")}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-2 border-l border-white/15 pl-4 text-[13px] font-semibold text-white/90 transition duration-300 hover:text-white md:inline-flex"
            >
              <svg className="h-4 w-4 fill-[#25D366]" viewBox="0 0 24 24" aria-hidden>
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              WhatsApp
            </a>

            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="touch-target grid h-11 w-11 place-items-center rounded-full border border-white/12 text-white/80 transition hover:border-white/25 hover:bg-white/5 md:hidden"
              aria-label="Menú principal"
              aria-expanded={mobileMenuOpen}
            >
              <span className="text-lg leading-none">{mobileMenuOpen ? "×" : "☰"}</span>
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="animate-fade-up max-h-[min(78dvh,640px)] overflow-y-auto border-t border-white/[0.06] bg-[#06070a] px-4 py-4 overscroll-contain md:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (item.href === "/") goHomeTop();
                  }}
                  className={`rounded-xl px-4 py-3.5 text-[15px] font-medium transition active:bg-white/10 ${
                    isActive(item.href)
                      ? "bg-white/10 text-white"
                      : "text-white/65 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
                <a
                  href={whatsappLink("Hola RG Motors, quiero información.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-11 items-center justify-center rounded-full bg-[#25D366] py-3.5 text-[14px] font-semibold text-white"
                >
                  WhatsApp
                </a>
                <Link
                  href="/simulador"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center rounded-full border border-white/15 py-3 text-sm font-medium text-white/90"
                >
                  Simular crédito
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setTradeInOpen(true);
                  }}
                  className="rounded-full py-2.5 text-sm text-white/55 transition hover:text-white"
                >
                  Tasar mi auto
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setCarRequestOpen(true);
                  }}
                  className="rounded-full py-2.5 text-sm text-white/55 transition hover:text-white"
                >
                  Buscar un modelo
                </button>
                <div className="flex justify-center gap-4 pt-2 text-xs text-white/40">
                  <a href={COMPANY.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                    Instagram
                  </a>
                  <a href={COMPANY.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                    Facebook
                  </a>
                </div>
              </div>
            </div>
          </nav>
        )}
      </header>

      <TradeInModal isOpen={tradeInOpen} onClose={() => setTradeInOpen(false)} />
      <CarRequestModal isOpen={carRequestOpen} onClose={() => setCarRequestOpen(false)} />
    </>
  );
}
