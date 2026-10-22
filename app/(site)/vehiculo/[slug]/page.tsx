import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Metadata } from "next";
import { formatCLP, getVehicle, spinFramesOf, spinHiFramesOf, type Vehicle } from "@/lib/vehicles";
import { getVehicles, getVehicleBySlug } from "@/lib/server/vehiclesStore";
import { getSettings } from "@/lib/server/settingsStore";
import { verifiedGallery, withVerifiedCover } from "@/lib/server/verifyPhotos";
import { stripPlateForPublic } from "@/lib/vehicles/publicFields";
import { vehicleSpecBar } from "@/lib/vehicles/publicSpecs";
import { plateToken, scrubPlate } from "@/lib/vehicles/publicSlug";
import { publicationDecision } from "@/lib/vehicles/publication";
import { publishesOnRg } from "@/lib/vehicles/branch";
import { whatsappLink } from "@/lib/company";
import { asset } from "@/lib/asset";
import { vehicleDocumentTitle, vehicleHeadline, vehicleMetaDescription } from "@/lib/seo/vehicleMeta";
import { vehicleJsonLd } from "@/lib/seo/vehicleJsonLd";
import VehicleViewer from "@/components/VehicleViewer";
import MobileVehicleStickyBar from "@/components/MobileVehicleStickyBar";
import ConsignaSection from "@/components/ConsignaSection";
import TrackVehicleView from "@/components/TrackVehicleView";
import ReferentialQuote from "@/components/ReferentialQuote";
import JsonLd from "@/components/JsonLd";
import Image from "next/image";

export const revalidate = 120;

async function loadRaw(slug: string): Promise<Vehicle | null> {
  const raw = (await getVehicleBySlug(slug)) || getVehicle(slug) || null;
  if (!raw || raw.status === "Borrador") return null;
  return raw;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const raw = await loadRaw(slug);
  const decision = publicationDecision(slug, raw);
  if (!raw || decision.type !== "render" || !publishesOnRg(raw)) {
    return { title: "Vehículo no encontrado | RG Motors", robots: { index: false } };
  }
  const v = stripPlateForPublic(raw);
  const [cover] = await verifiedGallery(v.image, v.gallery);
  const title = vehicleDocumentTitle(v);
  const description = vehicleMetaDescription(v);

  return {
    title,
    description,
    alternates: { canonical: `https://www.rgmotorschile.cl/vehiculo/${v.slug}` },
    openGraph: {
      title,
      description,
      images: [cover ? asset(cover) : "/og-image.png"],
    },
  };
}

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const raw = await loadRaw(slug);
  const decision = publicationDecision(slug, raw);
  if (decision.type === "redirect") permanentRedirect(decision.to);
  if (decision.type === "gone" || !raw || !publishesOnRg(raw)) notFound();

  const v = stripPlateForPublic(raw);
  const headline = vehicleHeadline(v);

  const [allVehicles, settings, gallery] = await Promise.all([
    getVehicles().catch(() => [] as Vehicle[]),
    getSettings().catch(() => null),
    verifiedGallery(v.image, v.gallery),
  ]);
  const spinFrames = settings?.preferences?.showSpin360 ? spinFramesOf(v).map((f) => asset(f)) : [];
  const spinHiFrames = spinFrames.length ? spinHiFramesOf(v).map((f) => asset(f)) : [];
  const similar = (
    await Promise.all(
      allVehicles
        .filter((x) => {
          const status = x.status || "Disponible";
          return x.slug !== raw.slug && x.bodyType === v.bodyType && x.hasRealPhotos && status !== "Borrador" && status !== "Vendido" && publishesOnRg(x);
        })
        .slice(0, 6)
        .map((x) => withVerifiedCover(stripPlateForPublic(x))),
    )
  )
    .filter((x) => Boolean(x.image))
    .slice(0, 3);

  const specs = vehicleSpecBar(raw);
  const plate = plateToken(raw);
  const highlights = (v.highlights || [])
    .map((item) => scrubPlate(item, plate))
    .filter(Boolean)
    .slice(0, 4);
  const sold = v.status === "Vendido";
  const reserved = v.status === "En reserva";
  const waMessage = `Hola RG Motors, me interesa el ${headline} publicado en ${formatCLP(v.price)}. ¿Está disponible?`;

  return (
    <main className="mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-12">
      <JsonLd data={vehicleJsonLd({ ...v, image: gallery[0] || v.image })} />
      <nav aria-label="Ruta" className="mb-5 flex min-w-0 items-center gap-2 text-xs text-white/60">
        <Link href="/catalogo" className="shrink-0 transition-colors hover:text-white">← Catálogo</Link>
        <span aria-hidden>/</span>
        <span className="truncate text-white/70">{headline}</span>
      </nav>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0">
          <VehicleViewer gallery={gallery} name={headline} spinFrames={spinFrames}
            spinHiFrames={spinHiFrames}
            spinFront={v.spin?.front}
          />
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <span
            className={`inline-block rounded-full border px-3 py-1 text-[11px] font-semibold ${
              sold
                ? "border-red-400/30 bg-red-400/10 text-red-300"
                : reserved
                ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            }`}
          >
            {sold ? "Vendido" : reserved ? "En reserva" : "Disponible"}
          </span>
          <h1 className="mt-3 break-words text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {headline}
          </h1>
          <p className="mt-1 break-words text-sm text-white/50">{v.location}</p>
          <p className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{formatCLP(v.price)}</p>

          {specs.length > 0 && (
            <dl className="mt-5 flex flex-wrap gap-2">
              {specs.map((s) => (
                <div key={s.label} className="min-w-[46%] flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 sm:min-w-[30%]">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{s.label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-white">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-6 space-y-2.5">
            <a
              href={whatsappLink(waMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#25D366] px-4 text-center text-[15px] font-bold text-[#052e16] transition hover:bg-[#20bd5a]"
            >
              Consultar por WhatsApp
            </a>
            {!sold && (
              <Link
                href={`/prueba-manejo/${v.slug}`}
                prefetch={false}
                className="flex min-h-12 w-full items-center justify-center rounded-full border border-white/15 px-4 text-center text-sm font-semibold text-white/90 transition hover:border-white/35"
              >
                Agendar prueba de manejo
              </Link>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-white/60">Inspección 150 puntos · Documentación al día</p>
          <ReferentialQuote price={v.price} name={headline} />
        </aside>
      </div>

      <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-10">
        <section className="min-w-0" aria-labelledby="ficha">
          <h2 id="ficha" className="text-base font-bold text-white">Ficha</h2>
          {highlights.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm text-white/65">
              {highlights.map((h) => (
                <li key={h} className="flex gap-2 break-words">
                  <span className="text-brand-300" aria-hidden>✓</span>
                  <span className="min-w-0">{h}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-white/60">Los datos que no están confirmados no se publican.</p>
          )}
        </section>

        <div className="min-w-0">
          <ConsignaSection compact />
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-12 border-t border-white/[0.08] pt-8" aria-labelledby="similares">
          <h2 id="similares" className="mb-4 text-base font-bold text-white">También te puede interesar</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {similar.map((x) => (
              <Link
                key={x.slug}
                href={`/vehiculo/${x.slug}`}
                className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/25"
              >
                <Image
                  src={asset(x.image)}
                  alt={vehicleHeadline(x)}
                  width={160}
                  height={120}
                  sizes="160px"
                  quality={55}
                  className="h-16 w-24 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white group-hover:text-brand-300">{vehicleHeadline(x)}</p>
                  <p className="text-xs text-white/50">{formatCLP(x.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <MobileVehicleStickyBar vehicle={{ ...v, image: gallery[0] ?? "", gallery }} />
      <TrackVehicleView
        slug={v.slug}
        brand={v.brand}
        model={v.model}
        year={v.year}
        price={v.price}
        bodyType={v.bodyType}
      />
    </main>
  );
}
