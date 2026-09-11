import Link from "next/link";
import Image from "next/image";
import { asset } from "@/lib/asset";
import { getVehicles } from "@/lib/server/vehiclesStore";
import {
  filterPublicCatalog,
  pickFeaturedVehicles,
} from "@/lib/vehicles/publicCatalog";
import { stripPlateForPublic } from "@/lib/vehicles/publicFields";
import VehicleCard from "@/components/VehicleCard";
import RevealOnScroll from "@/components/RevealOnScroll";
import AppleCareTrustSection from "@/components/AppleCareTrustSection";
import ShowroomMapSection from "@/components/ShowroomMapSection";
import HeroExploreHint from "@/components/HeroExploreHint";
import TrustMarquee from "@/components/TrustMarquee";

export const revalidate = 120;

export default async function Home() {
  const vehicles = await getVehicles();
  const publicVehicles = filterPublicCatalog(vehicles).map(stripPlateForPublic);
  const featured = pickFeaturedVehicles(vehicles, 6).map(stripPlateForPublic);

  return (
    <main className="relative overflow-x-clip">
      {/* HERO — mockup cinematográfico + acabado */}
      <section className="relative isolate rg-hero-min overflow-hidden">
        <Image
          src={asset("/hero-l200-puerto-montt.png")}
          alt="Stock RG Motors Puerto Montt"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="rg-hero-media object-cover object-[72%_42%] sm:object-[78%_center]"
        />
        {/* Más oscuro a la izquierda/abajo: el auto queda libre a la derecha */}
        <div className="rg-hero-vignette absolute inset-0 bg-[linear-gradient(105deg,rgba(0,0,0,0.9)_0%,rgba(0,0,0,0.78)_28%,rgba(0,0,0,0.35)_48%,rgba(0,0,0,0.08)_62%,transparent_78%)] sm:bg-[linear-gradient(105deg,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.72)_22%,rgba(0,0,0,0.28)_42%,rgba(0,0,0,0.05)_58%,transparent_72%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,transparent_16%,transparent_48%,rgba(6,7,10,0.97)_100%)]" />
        <div className="rg-grain" aria-hidden />

        <div className="relative mx-auto flex rg-hero-min max-w-7xl flex-col justify-end px-4 pb-[max(8.75rem,calc(env(safe-area-inset-bottom)+7.25rem))] pt-[max(6.25rem,calc(env(safe-area-inset-top)+4.75rem))] sm:px-8 sm:pb-32 sm:pt-[max(7rem,calc(env(safe-area-inset-top)+5.5rem))] lg:px-10 lg:pb-36">
          <div className="rg-stagger w-full max-w-[22rem] sm:max-w-[28rem]">
            <p className="font-display text-base font-semibold uppercase tracking-[0.14em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] sm:text-xl">
              RG Motors
            </p>
            <p className="mt-1 text-[11px] font-medium tracking-wide text-white/65 sm:text-[13px]">
              Puerto Montt · Showroom Av. El Tepual
            </p>

            <h1 className="font-display mt-3 text-[clamp(1.7rem,7.2vw,2rem)] font-semibold leading-[1.12] tracking-wide text-white drop-shadow-[0_6px_32px_rgba(0,0,0,0.9)] sm:mt-4 sm:text-[2.55rem] sm:leading-[1.1] lg:text-[2.85rem]">
              Tu próximo vehículo,
              <br />
              con financiamiento a tu medida
            </h1>

            <p className="mt-4 max-w-[20rem] text-[14px] leading-relaxed text-white/80 drop-shadow-[0_2px_18px_rgba(0,0,0,0.8)] sm:mt-5 sm:max-w-none sm:text-base">
              Camionetas y autos con fotos reales de patio.
              <span className="hidden sm:inline">
                <br />
                Visítalos en Puerto Montt y simula tu cuota con Autofin.
              </span>
              <span className="sm:hidden"> Visítalos en Puerto Montt.</span>
            </p>

            <div className="rg-cta-row mt-7 sm:mt-8">
              <Link
                href="/catalogo"
                className="rg-btn-primary inline-flex min-h-12 items-center justify-center rounded-xl px-7 py-3.5 text-[15px] font-bold text-white sm:min-h-11 sm:min-w-[9.5rem] sm:rounded-lg"
              >
                Ver catálogo
              </Link>
              <Link
                href="/simulador"
                className="rg-btn-ghost-light inline-flex min-h-12 items-center justify-center rounded-xl px-7 py-3.5 text-[15px] font-bold sm:min-h-11 sm:min-w-[9.5rem] sm:rounded-lg"
              >
                Simular cuota
              </Link>
            </div>
          </div>
        </div>

        <HeroExploreHint />
      </section>

      <TrustMarquee />

      {/* DESTACADOS */}
      <section id="catalogo" className="relative scroll-mt-24 mx-auto max-w-7xl px-4 pb-16 pt-2 sm:px-6 sm:pb-20 sm:pt-0">
        <RevealOnScroll>
          <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
            <div>
              <h2 className="text-[1.35rem] font-extrabold tracking-tight text-white sm:text-3xl">
                Vehículos destacados
              </h2>
              <p className="mt-1 text-[13px] text-white/50 sm:text-sm">
                Unidades seleccionadas por estado mecánico y estético.
              </p>
            </div>
            <Link href="/catalogo" className="rg-link min-h-11 items-center text-sm font-semibold text-brand-300 hover:text-white">
              Ver catálogo completo
              <span className="rg-link-arrow" aria-hidden>
                →
              </span>
            </Link>
          </div>
        </RevealOnScroll>

        <div className="grid gap-3 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((v, idx) => (
            <RevealOnScroll key={v.slug} delay={idx * 70}>
              <VehicleCard vehicle={v} />
            </RevealOnScroll>
          ))}
        </div>

        <div className="mt-8 text-center sm:mt-10">
          <Link
            href="/catalogo"
            className="apple-btn-secondary inline-flex min-h-12 w-full max-w-sm items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-white sm:w-auto sm:min-h-11"
          >
            Ver todos los {publicVehicles.length} vehículos →
          </Link>
        </div>
      </section>

      {/* PROCESO */}
      <section className="border-y border-white/[0.08] bg-[#0a0b10] py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <RevealOnScroll>
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-gradient-to-r from-[#C9A84C] to-transparent" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C9A84C]/90">
                Proceso
              </p>
            </div>
            <h2 className="mt-4 font-display text-[1.55rem] font-semibold uppercase tracking-[0.03em] text-white sm:text-[2.25rem]">
              Comprar en cuatro pasos
            </h2>
            <p className="mt-3 max-w-xl text-[13px] text-white/48 sm:text-sm">
              Del catálogo al showroom, con atención en Puerto Montt.
            </p>
          </RevealOnScroll>

          <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <RevealOnScroll delay={60}>
              <Step n="1" title="Explora el stock" text="Filtra vehículos inspeccionados con ficha clara y fotos reales." />
            </RevealOnScroll>
            <RevealOnScroll delay={100}>
              <Step n="2" title="Revisa en detalle" text="Galería, 360° cuando está disponible e información técnica." />
            </RevealOnScroll>
            <RevealOnScroll delay={140}>
              <Step n="3" title="Simula tu cuota" text="Elige pie y plazo. Te contactamos en horario hábil el mismo día." />
            </RevealOnScroll>
            <RevealOnScroll delay={180}>
              <Step n="4" title="Visita el showroom" text="Coordinamos entrega o visita al patio en Puerto Montt." />
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* SHOWROOM */}
      <section className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16">
        <ShowroomMapSection />
      </section>

      {/* FINANCIAMIENTO + TRANSPARENCIA + CIERRE */}
      <RevealOnScroll>
        <AppleCareTrustSection />
      </RevealOnScroll>
    </main>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="group h-full border border-white/[0.08] bg-[#0e1016] px-5 py-5 transition duration-300 hover:border-[#C9A84C]/25 hover:bg-[#12151c]">
      <span className="font-display text-sm tracking-[0.18em] text-[#C9A84C]/80">{n.padStart(2, "0")}</span>
      <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-white/48">{text}</p>
    </div>
  );
}
