"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { asset } from "@/lib/asset";
import PhotoSpin360 from "./PhotoSpin360";

type Tab = "exterior" | "fotos";

const PLACEHOLDER = "/images/placeholder-pending-car.svg";

/**
 * Galería de la ficha.
 *
 * - La galería llega verificada desde el servidor (sin URLs Blob 404), así el HTML
 *   inicial y la hidratación muestran lo mismo: sin parpadeo.
 * - Sin fetch extra al montar (antes: /api/settings, /api/photos y manifest 360 cambiaban
 *   el estado después de hidratar → re-render y saltos de layout).
 * - Si una foto falla igual en el navegador, se quita de la lista (no se reemplaza por el
 *   placeholder). El placeholder aparece solo si no queda ninguna foto, y fijo.
 */
export default function VehicleViewer({
  gallery,
  name,
  spinFrames = [],
}: {
  gallery: string[];
  name: string;
  spinFrames?: string[];
}) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const photos = useMemo(() => gallery.filter((src) => !failed.has(src)), [gallery, failed]);
  const [selected, setSelected] = useState(0);
  const hasSpin = spinFrames.length > 0;
  const [tab, setTab] = useState<Tab>("fotos");

  const markFailed = useCallback((src: string) => {
    setFailed((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);

  const count = photos.length;
  const idx = count ? Math.min(selected, count - 1) : 0;
  const current = photos[idx];

  const go = (delta: number) => {
    if (!count) return;
    setSelected((idx + delta + count) % count);
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3">
      {hasSpin && (
        <div className="inline-flex max-w-full items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          {(["fotos", "exterior"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                tab === t ? "bg-brand-500 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {t === "fotos" ? `Fotos (${count})` : "Tour 360°"}
            </button>
          ))}
        </div>
      )}

      <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#080b11] sm:aspect-[16/10] sm:rounded-3xl">
        {tab === "exterior" && hasSpin ? (
          <PhotoSpin360 frames={spinFrames} className="absolute inset-0 h-full w-full" autoPlay={false} />
        ) : current ? (
          <>
            <Image
              key={current}
              src={asset(current)}
              alt={`${name} - Foto ${idx + 1} de ${count}`}
              fill
              priority={idx === 0}
              sizes="(max-width: 1024px) 100vw, 60vw"
              quality={85}
              className="select-none object-cover object-center"
              onError={() => markFailed(current)}
            />
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Foto anterior"
                  className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-lg text-white backdrop-blur-md transition hover:bg-black/80 sm:left-3"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Foto siguiente"
                  className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-lg text-white backdrop-blur-md transition hover:bg-black/80 sm:right-3"
                >
                  ›
                </button>
                <span className="absolute bottom-3 right-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md">
                  {idx + 1} / {count}
                </span>
              </>
            )}
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset(PLACEHOLDER)}
            alt={`${name}: fotografías en preparación`}
            className="absolute inset-0 h-full w-full object-cover"
            data-testid="photos-pending"
          />
        )}
      </div>

      {tab === "fotos" && count > 1 && (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="list">
          {photos.map((src, i) => (
            <button
              key={src}
              type="button"
              role="listitem"
              onClick={() => setSelected(i)}
              aria-label={`Ver foto ${i + 1}`}
              className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border transition sm:h-16 sm:w-24 ${
                i === idx ? "border-brand-400 ring-1 ring-brand-400/40" : "border-white/10 opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset(src)}
                alt=""
                loading="lazy"
                decoding="async"
                width={96}
                height={64}
                className="h-full w-full object-cover"
                onError={() => markFailed(src)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
