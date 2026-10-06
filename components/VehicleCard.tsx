"use client";

import Link from "next/link";
import { Vehicle, formatCLP } from "@/lib/vehicles";
import SafeImage from "@/components/SafeImage";

type CardVehicle = Vehicle & {
  galleryCount?: number;
  hasSpin?: boolean;
};

export default function VehicleCard({ vehicle: v }: { vehicle: Vehicle }) {
  const card = v as CardVehicle;
  const has360 = Boolean((card.spin && card.spin.count > 0) || card.hasSpin);
  const galleryCount = card.gallery?.length ?? card.galleryCount ?? 0;

  // El API ?fields=card no envía gallery[], solo galleryCount + image + hasRealPhotos
  const showRealPhoto = Boolean(
    card.image &&
      !card.image.includes("placeholder-pending-car") &&
      (card.hasRealPhotos || galleryCount > 0),
  );
  const displayImage = showRealPhoto
    ? card.image
    : "/images/placeholder-pending-car.svg";

  return (
    <Link
      href={`/vehiculo/${card.slug}`}
      className="rg-card-lift group relative flex overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0e1016] shadow-[0_16px_40px_-18px_rgba(0,0,0,0.8)] transition duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-brand-400/35 hover:shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)] active:scale-[0.985] sm:flex-col"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-60" />

      {/* Móvil: miniatura lateral compacta. Desktop: foto ancha arriba. */}
      <div className="relative aspect-[4/3] w-[42%] max-w-[9.5rem] shrink-0 overflow-hidden bg-ink-900 sm:aspect-[16/10] sm:w-full sm:max-w-none">
        <SafeImage
          src={displayImage}
          alt={`${card.brand} ${card.model}`}
          fill
          sizes="(max-width: 640px) 42vw, (max-width: 1024px) 50vw, 33vw"
          quality={82}
          className="object-cover object-center transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e1016]/40 via-transparent to-black/10 opacity-80 sm:opacity-80" />
        <div className="absolute inset-0 hidden translate-x-[-120%] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-[120%] sm:block" />

        <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1 sm:left-3 sm:top-3 sm:gap-1.5">
          {has360 && (
            <span className="rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm sm:px-2 sm:py-1 sm:text-[10px]">
              360°
            </span>
          )}
          {!showRealPhoto && (
            <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-semibold text-black sm:px-2 sm:py-1 sm:text-[10px]">
              Fotos pronto
            </span>
          )}
          {card.featured && (
            <span className="rounded-md bg-brand-500 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(23,58,121,0.8)] sm:px-2 sm:py-1 sm:text-[10px]">
              Destacado
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 border-l border-white/[0.06] bg-[#12141c] p-3 sm:gap-3 sm:border-l-0 sm:border-t sm:p-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-bold tracking-tight text-white transition-colors group-hover:text-brand-200 sm:text-base">
              {card.brand} {card.model}
            </h3>
            {card.version ? (
              <p className="mt-0.5 truncate text-[11px] text-white/45 sm:text-xs">{card.version}</p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-white/45 sm:px-2 sm:text-xs">
            {card.year}
          </span>
        </div>

        <p className="truncate text-[11px] leading-relaxed text-white/50">
          {card.km.toLocaleString("es-CL")} km
          <span className="mx-1 text-white/20 sm:mx-1.5">·</span>
          {card.fuel}
          <span className="mx-1 text-white/20 sm:mx-1.5">·</span>
          {card.transmission}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-0.5 sm:gap-3 sm:pt-1">
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-wider text-white/35 sm:text-[11px]">
              Precio
            </p>
            <p className="truncate text-[15px] font-extrabold tracking-tight text-white sm:text-xl">
              {formatCLP(card.price)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
