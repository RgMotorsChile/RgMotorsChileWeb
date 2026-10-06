"use client";

import { COMPANY, whatsappLink } from "@/lib/company";

const LAT = -41.4638;
const LNG = -72.98125;

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s6.2-5.2 6.2-10a6.2 6.2 0 10-12.4 0c0 4.8 6.2 10 6.2 10z"
        stroke="url(#rg-map-gold)"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="11" r="2.1" stroke="url(#rg-map-gold)" strokeWidth="1.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.2" stroke="url(#rg-map-gold)" strokeWidth="1.55" />
      <path d="M12 8.2v4.2l2.8 1.7" stroke="url(#rg-map-gold)" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.2 4.8h2.4l1.1 3.2-1.5 1a11.2 11.2 0 005.1 5.1l1-1.5 3.2 1.1v2.4c0 .7-.5 1.3-1.2 1.4A14.8 14.8 0 016.8 6c.1-.7.7-1.2 1.4-1.2z"
        stroke="url(#rg-map-gold)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ShowroomMapSection({ className = "" }: { className?: string }) {
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${LAT},${LNG}`;
  const wazeUrl = `https://waze.com/ul?ll=${LAT},${LNG}&navigate=yes`;
  const visitWhatsApp = whatsappLink(
    "Hola RG Motors, quiero coordinar una visita a su showroom de Av. Cardonal en Puerto Montt."
  );

  return (
    <section className={`relative ${className}`}>
      <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
        <defs>
          <linearGradient id="rg-map-gold" x1="0%" y1="0%" x2="40%" y2="100%">
            <stop offset="0%" stopColor="#F1E0A6" />
            <stop offset="45%" stopColor="#C9A84C" />
            <stop offset="100%" stopColor="#7A5A1C" />
          </linearGradient>
        </defs>
      </svg>

      {/* Header editorial */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-gradient-to-r from-[#C9A84C] to-transparent" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C9A84C]/90">
              Showroom
            </p>
          </div>
          <h2 className="mt-4 font-display text-[clamp(1.75rem,8vw,2.15rem)] font-semibold uppercase leading-[1.05] tracking-[0.04em] text-white sm:text-[2.75rem]">
            Visítanos en
            <br />
            <span className="text-white/92">Puerto Montt</span>
          </h2>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/48 sm:text-[15px]">
            Av. Cardonal · Ex Banco de Chile. Revisa unidades en persona y agenda tu prueba de
            manejo.
          </p>
        </div>

        <a
          href={visitWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          className="rg-btn-primary inline-flex min-h-12 w-full items-center justify-center rounded-xl px-7 py-3.5 text-sm font-bold text-white sm:min-h-11 sm:w-fit sm:rounded-lg"
        >
          Coordinar visita
        </a>
      </div>

      {/* Mapa + ficha */}
      <div className="mt-8 grid overflow-hidden rounded-2xl border border-white/[0.08] lg:mt-10 lg:grid-cols-[1.55fr_1fr]">
        {/* Mapa oscuro cinematográfico */}
        <div className="relative min-h-[240px] bg-[#e8eaed] sm:min-h-[300px] lg:min-h-[420px]">
          <iframe
            title="Ubicación RG Motors Puerto Montt - Av. Cardonal"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(
              `${LAT},${LNG}`,
            )}&z=16&hl=es&output=embed`}
            className="absolute inset-0 h-full w-full border-0 bg-[#e8eaed]"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          {/* Soft blend toward the info panel only */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0c0d12]/70 to-transparent max-lg:hidden" />

          {/* Chip flotante */}
          <div className="absolute bottom-4 left-4 z-[1] flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3.5 py-2 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C9A84C] shadow-[0_0_8px_rgba(201,168,76,0.7)]" />
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium tracking-wide text-white/80 hover:text-white"
            >
              RG Motors · abrir mapa
            </a>
          </div>
        </div>

        {/* Ficha de dirección */}
        <aside className="relative flex flex-col justify-between border-t border-white/[0.08] bg-gradient-to-b from-[#12141b] via-[#0d0e14] to-[#0a0b10] px-5 py-7 sm:px-9 sm:py-10 lg:border-l lg:border-t-0">
          <div className="pointer-events-none absolute left-0 top-10 hidden h-24 w-px bg-gradient-to-b from-[#C9A84C] via-[#C9A84C]/40 to-transparent lg:block" />

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C9A84C]/85">
              Dirección
            </p>
            <h3 className="mt-3 font-display text-[1.65rem] font-semibold uppercase leading-none tracking-[0.06em] text-white sm:text-[1.85rem]">
              Av. Cardonal
            </h3>
            <p className="mt-2 text-sm text-white/42">Puerto Montt · Región de Los Lagos</p>

            <p className="mt-6 max-w-sm text-[13.5px] leading-relaxed text-white/55">
              Patio de exhibición al costado de Acenor, con acceso cercano a Ruta 5 Sur. Camionetas
              4×4, SUVs y unidades seleccionadas listas para ver y retirar.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 shrink-0 opacity-90">
                <PinIcon />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Referencia
                </p>
                <p className="mt-0.5 text-sm text-white/75">Ex Banco de Chile · costado Acenor</p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 shrink-0 opacity-90">
                <ClockIcon />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Horario
                </p>
                <p className="mt-0.5 text-sm text-white/75">{COMPANY.hours}</p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 shrink-0 opacity-90">
                <PhoneIcon />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Teléfono
                </p>
                <a
                  href={`tel:${COMPANY.whatsapp}`}
                  className="mt-0.5 block text-sm text-white/75 transition hover:text-white"
                >
                  {COMPANY.phoneDisplay}
                </a>
              </div>
            </div>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.08] pt-6">
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-semibold tracking-wide text-white/70 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-[#C9A84C]/60"
            >
              Abrir en Google Maps
            </a>
            <span className="hidden text-white/20 sm:inline">·</span>
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-semibold tracking-wide text-white/70 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-[#C9A84C]/60"
            >
              Abrir en Waze
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}
