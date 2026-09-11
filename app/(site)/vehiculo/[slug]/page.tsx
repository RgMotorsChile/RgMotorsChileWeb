import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import {
  getVehicle,
  vehicles,
  formatCLP,
  specsOf,
  estimateMonthly,
  spinFramesOf,
} from "@/lib/vehicles";
import { getVehicles, getVehicleBySlug } from "@/lib/server/vehiclesStore";
import { stripPlateForPublic } from "@/lib/vehicles/publicFields";
import { asset } from "@/lib/asset";
import VehicleViewer from "@/components/VehicleViewer";
import CuotaSimulator from "@/components/CuotaSimulator";
import VehicleActionButtons from "@/components/VehicleActionButtons";
import MobileVehicleStickyBar from "@/components/MobileVehicleStickyBar";

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = (await getVehicleBySlug(slug)) || getVehicle(slug);
  if (!v) return { title: "Vehículo no encontrado | RG Motors" };

  return {
    title: `${v.brand} ${v.model} ${v.year} — ${formatCLP(v.price)} | RG Motors`,
    description: `${v.brand} ${v.model} ${v.version} año ${v.year} con ${v.km.toLocaleString("es-CL")} km. Inspección de 150 puntos, fotografías reales y simulación de crédito online.`,
    openGraph: {
      title: `${v.brand} ${v.model} ${v.year} | RG Motors`,
      description: `Precio: ${formatCLP(v.price)} · ${v.km.toLocaleString("es-CL")} km · ${v.fuel} · ${v.transmission}`,
      images: [asset(v.image)],
    },
  };
}

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const raw = (await getVehicleBySlug(slug)) || getVehicle(slug);
  if (!raw) notFound();
  const v = stripPlateForPublic(raw);

  const allVehicles = await getVehicles().catch(() => vehicles);
  const publicVehicles = allVehicles
    .filter((item) => {
      const status = item.status || "Disponible";
      return status !== "Borrador" && status !== "Vendido";
    })
    .map(stripPlateForPublic);
  const monthly = estimateMonthly(v.price);

  return (
    <main className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-6 pb-28 sm:px-6 sm:py-8 sm:pb-28 lg:pb-8 space-y-6 sm:space-y-8">
      {/* Top Header & Breadcrumbs */}
      <div className="flex min-w-0 flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:pb-6">
        <div className="min-w-0 flex-1">
          <nav className="mb-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/50 backdrop-blur-md sm:px-4">
            <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
            <span>›</span>
            <Link href="/catalogo" className="hover:text-white transition-colors">Catálogo</Link>
            <span>›</span>
            <span className="truncate text-white/90 font-semibold">{v.brand} {v.model}</span>
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl">
            {v.brand} {v.model}{" "}
            <span className="text-lg font-normal text-white/50 sm:text-2xl">· {v.year}</span>
          </h1>
          <p className="mt-1 truncate text-xs text-white/50">{v.version} · {v.location}</p>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl">
            {formatCLP(v.price)}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Desde <span className="font-semibold text-brand-300">{formatCLP(monthly)}</span>/mes
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8 lg:items-start">
        {/* Left Column */}
        <div className="min-w-0 space-y-6 sm:space-y-8">
          <VehicleViewer
            image={asset(v.image)}
            gallery={v.gallery?.map(g => asset(g))}
            name={`${v.brand} ${v.model}`}
            slug={v.slug}
            spinFrames={spinFramesOf(v)}
          />

          <section className="apple-glass-card rounded-2xl p-4 space-y-4 sm:rounded-3xl sm:p-6">
            <h2 className="border-b border-white/10 pb-3 text-base font-bold tracking-tight text-white">
              Ficha Técnica Certificada
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {specsOf(v).map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-md sm:p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{s.label}</p>
                  <p className="mt-1 text-xs font-bold text-white break-words">{s.value}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="min-w-0 space-y-5 sm:space-y-6 lg:sticky lg:top-24">
          <div className="apple-glass-card space-y-5 rounded-2xl border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-ink-950 to-black p-4 shadow-glow sm:rounded-3xl sm:p-6">
            <div>
              <span className={`inline-block rounded-full border px-3 py-1 text-[11px] font-bold ${
                v.status === "En reserva"
                  ? "border-amber-400/30 bg-amber-400/15 text-amber-400"
                  : v.status === "Vendido"
                  ? "border-red-400/30 bg-red-400/15 text-red-400"
                  : "border-emerald-400/30 bg-emerald-400/15 text-emerald-400"
              }`}>
                {v.status === "En reserva"
                  ? "● En proceso de reserva"
                  : v.status === "Vendido"
                  ? "● Vehículo vendido"
                  : "✓ Disponible para entrega inmediata"}
              </span>
              <h3 className="mt-3 text-base font-bold tracking-tight text-white sm:text-lg">Consultar o financiar</h3>
              <p className="mt-1 text-xs text-white/55">
                WhatsApp, simulación Autofin y tasación de tu auto en parte de pago.
              </p>
            </div>

            <VehicleActionButtons vehicle={v} />

            <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-center text-[11px] text-white/60">
              <p>🔧 Inspección 150 puntos</p>
              <p>📄 Documentación al día</p>
            </div>
          </div>

          <CuotaSimulator price={v.price} vehicleYear={v.year} vehicleSlug={v.slug} />
        </div>
      </div>

      {/* Similar vehicles */}
      <section className="mt-12 border-t border-white/[0.08] pt-8">
        <h2 className="mb-6 text-lg font-bold tracking-tight text-white">Vehículos similares disponibles</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {publicVehicles
            .filter((x) => x.slug !== v.slug && x.bodyType === v.bodyType)
            .slice(0, 3)
            .map((x) => (
              <Link
                key={x.slug}
                href={`/vehiculo/${x.slug}`}
                className="apple-glass-card group flex items-center gap-4 rounded-3xl p-3.5 transition-all duration-300 hover:-translate-y-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset(x.image)} alt={x.model} className="h-16 w-24 rounded-2xl object-cover" />
                <div>
                  <p className="text-xs font-bold text-white group-hover:text-brand-300 transition-colors">
                    {x.brand} {x.model}
                  </p>
                  <p className="text-xs font-semibold text-brand-300 mt-0.5">{formatCLP(x.price)}</p>
                </div>
              </Link>
            ))}
        </div>
      </section>

      <MobileVehicleStickyBar vehicle={v} />
    </main>
  );
}
