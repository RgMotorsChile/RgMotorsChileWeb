"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { asset } from "@/lib/asset";
import { formatCLP } from "@/lib/vehicles/format";
import type { Vehicle } from "@/lib/vehicles";

interface Hero3DCarouselProps {
  vehicles?: Vehicle[];
}

export default function Hero3DCarousel({ vehicles = [] }: Hero3DCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Select vehicles to showcase in Hero: prioritize Toyota and Mitsubishi
  const items = useMemo(() => {
    if (!vehicles || vehicles.length === 0) return [];
    
    // Pick Toyota and Mitsubishi (with real photos prioritized, then top priced)
    const toyotas = vehicles.filter((v) => v.brand.toLowerCase() === "toyota");
    const mitsus = vehicles.filter((v) => v.brand.toLowerCase() === "mitsubishi");

    // Alternate Toyota and Mitsubishi to showcase both brands prominently
    const combined: Vehicle[] = [];
    const maxLen = Math.max(toyotas.length, mitsus.length);
    for (let i = 0; i < maxLen; i++) {
      if (toyotas[i]) combined.push(toyotas[i]);
      if (mitsus[i]) combined.push(mitsus[i]);
      if (combined.length >= 6) break;
    }

    if (combined.length >= 2) {
      return combined;
    }

    return vehicles.slice(0, 5);
  }, [vehicles]);

  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPaused, items.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].screenX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
  };

  return (
    <div
      className="relative w-full py-4 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 3D Stage Container */}
      <div className="relative mx-auto h-[270px] sm:h-[310px] w-full max-w-[420px] [perspective:1000px] flex items-center justify-center">
        {items.map((item, idx) => {
          const total = items.length;
          let offset = idx - currentIndex;
          if (offset < -Math.floor(total / 2)) offset += total;
          if (offset > Math.floor(total / 2)) offset -= total;

          const isActive = offset === 0;
          const isPrev = offset === -1;
          const isNext = offset === 1;

          let transformStyle = "";
          let opacity = 0;
          let zIndex = 0;
          let pointerEvents: "auto" | "none" = "none";

          if (isActive) {
            transformStyle = "translateX(0%) scale(1) rotateY(0deg) translateZ(0px)";
            opacity = 1;
            zIndex = 30;
            pointerEvents = "auto";
          } else if (isPrev) {
            transformStyle = "translateX(-32%) scale(0.8) rotateY(20deg) translateZ(-100px)";
            opacity = 0.55;
            zIndex = 20;
            pointerEvents = "auto";
          } else if (isNext) {
            transformStyle = "translateX(32%) scale(0.8) rotateY(-20deg) translateZ(-100px)";
            opacity = 0.55;
            zIndex = 20;
            pointerEvents = "auto";
          } else {
            const dir = offset < 0 ? -1 : 1;
            transformStyle = `translateX(${dir * 55}%) scale(0.65) rotateY(${dir * -28}deg) translateZ(-180px)`;
            opacity = 0;
            zIndex = 10;
          }

          const hasRealPhotos = Boolean(
            item.hasRealPhotos &&
            item.gallery &&
            item.gallery.length > 0 &&
            item.image &&
            !item.image.includes("placeholder-pending-car")
          );
          const displayImage = hasRealPhotos
            ? asset(item.image)
            : asset("/images/placeholder-pending-car.svg");

          return (
            <div
              key={item.slug}
              onClick={() => {
                if (isPrev) handlePrev();
                if (isNext) handleNext();
              }}
              style={{
                transform: transformStyle,
                opacity,
                zIndex,
                pointerEvents,
              }}
              className="absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer"
            >
              <div
                className={`apple-glass-card relative h-full w-full overflow-hidden rounded-3xl border transition-all duration-500 ${
                  isActive
                    ? "border-brand-400/50 shadow-glow ring-1 ring-white/20"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {/* Vehicle Image */}
                <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-ink-900 via-ink-950 to-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayImage}
                    alt={`${item.brand} ${item.model}`}
                    loading={idx <= 1 ? "eager" : "lazy"}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = asset("/images/placeholder-pending-car.svg");
                    }}
                    className={`h-full w-full object-cover transition-transform duration-700 ease-out ${
                      isActive ? "hover:scale-105" : ""
                    }`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />

                  {/* Top Badges */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
                    {hasRealPhotos ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-black/75 px-3 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur-md shadow-sm">
                        <span>📸</span> Fotos Reales
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-black/75 px-3 py-1 text-[11px] font-medium text-amber-300 backdrop-blur-md shadow-sm">
                        <span>⏳</span> Fotos en preparación
                      </span>
                    )}

                    <span className="rounded-full border border-white/20 bg-black/80 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                      {item.price > 0 ? formatCLP(item.price) : "Consultar precio"}
                    </span>
                  </div>

                  {/* Bottom Info Bar */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl border border-white/15 bg-black/80 p-3 backdrop-blur-md z-20">
                    <div>
                      <p className="text-sm font-bold text-white tracking-tight">
                        {item.brand} {item.model}
                      </p>
                      <p className="text-[11px] text-white/50">
                        {item.version} · {item.year}
                      </p>
                    </div>

                    {isActive ? (
                      <Link
                        href={`/vehiculo/${item.slug}`}
                        className="apple-btn-primary rounded-full px-4 py-2 text-xs font-bold text-white shadow-glow transition-all hover:scale-105"
                      >
                        Ver vehículo →
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold text-white/50">Ver →</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Studio Floor Shadow under active 3D card */}
      <div className="studio-floor-shadow mx-auto max-w-[500px]" />

      {/* Controls & Pagination Dots */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          onClick={handlePrev}
          aria-label="Anterior"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/80 backdrop-blur-md transition-all hover:bg-white/15 hover:text-white active:scale-95 font-bold"
        >
          ‹
        </button>

        {/* Indicators */}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 backdrop-blur-md">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              aria-label={`Ir a diapositiva ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? "w-6 bg-brand-400 shadow-glow"
                  : "w-2 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          aria-label="Siguiente"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/80 backdrop-blur-md transition-all hover:bg-white/15 hover:text-white active:scale-95 font-bold"
        >
          ›
        </button>
      </div>
    </div>
  );
}
