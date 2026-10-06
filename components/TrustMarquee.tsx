"use client";

import type { ReactNode } from "react";

type TrustItem = {
  label: string;
  detail: string;
  mark: ReactNode;
};

const G = "url(#rg-trust-gold)";
const GS = "url(#rg-trust-gold-soft)";

function GoldDefs() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <linearGradient id="rg-trust-gold" x1="0%" y1="0%" x2="40%" y2="100%">
          <stop offset="0%" stopColor="#F4E6B0" />
          <stop offset="38%" stopColor="#C9A84C" />
          <stop offset="72%" stopColor="#A07828" />
          <stop offset="100%" stopColor="#6E4F16" />
        </linearGradient>
        <linearGradient id="rg-trust-gold-soft" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#EAD7A0" />
          <stop offset="100%" stopColor="#9A7828" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MarkSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[28px] w-full items-center justify-center overflow-visible">
      {children}
    </div>
  );
}

function TrustIcon({ children }: { children: ReactNode }) {
  return (
    <MarkSlot>
      <span className="inline-flex opacity-95 drop-shadow-[0_1px_2px_rgba(110,79,22,0.45)]">
        {children}
      </span>
    </MarkSlot>
  );
}

function AutofinMark() {
  return (
    <MarkSlot>
      <svg
        viewBox="0 0 196 48"
        className="h-[22px] w-auto max-w-[152px] overflow-visible"
        role="img"
        aria-label="AUTOFIN"
      >
        {/* tip dorado sobre la A */}
        <circle cx="17" cy="8.5" r="3.4" fill={G} />
        {/* A */}
        <path
          d="M5 38 L17 12 L29 38"
          stroke="#EDE8DC"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* U */}
        <path
          d="M39 13.5 v14.5 c0 4.2 2.8 6.6 6.8 6.6 s6.8-2.4 6.8-6.6 V13.5"
          stroke="#EDE8DC"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* T */}
        <path d="M63 13.5 h19.5 M72.75 13.5 v24" stroke="#EDE8DC" strokeWidth="4.2" strokeLinecap="round" />
        {/* O */}
        <circle cx="100" cy="25.5" r="10.6" stroke="#EDE8DC" strokeWidth="4.2" fill="none" />
        {/* F completa: tallo hasta abajo + dos barras */}
        <path
          d="M118 13.5 v24 M118 13.5 h17 M118 25.5 h13"
          stroke="#EDE8DC"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* I */}
        <path d="M147 13.5 v24" stroke="#EDE8DC" strokeWidth="4.2" strokeLinecap="round" />
        {/* N */}
        <path
          d="M160 37.5 V13.5 L176.5 37.5 V13.5"
          stroke="#EDE8DC"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </MarkSlot>
  );
}

function AutofactMark() {
  const fill = "#3D8FCB";
  return (
    <MarkSlot>
      <svg
        viewBox="0 0 99.579 30.297"
        className="h-[20px] w-auto max-w-[148px]"
        role="img"
        aria-label="autofact"
      >
        <g transform="translate(4.805 12.447)">
          <path
            d="M19.3,63.045l3.585-10.854a2.779,2.779,0,0,1,.772-1.295A2.9,2.9,0,0,1,25.8,50a3.023,3.023,0,0,1,2.913,2.241l3.535,10.8H28.362l-.672-2.116H23.906l-.7,2.116Zm7.17-5.825L25.8,55.178l-.7,2.041Z"
            transform="translate(-19.3 -50)"
            fill={fill}
          />
          <path
            d="M76.884,50v8.165a1.229,1.229,0,0,0,.349.846,1.2,1.2,0,0,0,1.693,0,1.144,1.144,0,0,0,.349-.846V50h3.684v8.165A4.679,4.679,0,0,1,81.54,61.6a4.929,4.929,0,0,1-6.921,0A4.679,4.679,0,0,1,73.2,58.165V50Z"
            transform="translate(-59.782 -50)"
            fill={fill}
          />
          <path
            d="M126.634,53.684h-2.962V63.02h-3.684V53.684H117V50h9.659v3.684Z"
            transform="translate(-92.678 -50)"
            fill={fill}
          />
          <path
            d="M163.322,63.045a6.545,6.545,0,1,1,4.606-1.917A6.3,6.3,0,0,1,163.322,63.045Zm0-9.36a2.8,2.8,0,1,0,1.992.822A2.766,2.766,0,0,0,163.322,53.684Z"
            transform="translate(-122.57 -50)"
            fill={fill}
          />
          <path
            d="M220.969,58.414h-3.659V63.02H213.6V53.709a3.76,3.76,0,0,1,1.145-2.564A3.859,3.859,0,0,1,217.508,50h4.282v3.684h-3.933a.549.549,0,0,0-.373.149.507.507,0,0,0-.149.373v.4h3.635Z"
            transform="translate(-165.229 -50)"
            fill={fill}
          />
          <path
            d="M242.6,63.045l3.585-10.854a2.779,2.779,0,0,1,.772-1.295A2.9,2.9,0,0,1,249.1,50a3.023,3.023,0,0,1,2.913,2.241l3.535,10.8h-3.908l-.7-2.116h-3.784l-.7,2.116Zm7.02-5.825-.672-2.041-.672,2.041Z"
            transform="translate(-187.01 -50)"
            fill={fill}
          />
          <path
            d="M301.714,54.531a2.813,2.813,0,1,0,0,3.983l2.614,2.614a6.51,6.51,0,1,1,0-9.236Z"
            transform="translate(-225.013 -50)"
            fill={fill}
          />
          <path
            d="M351.034,53.684h-2.962V63.02h-3.684V53.684H341.4V50h9.659v3.684Z"
            transform="translate(-261.214 -50)"
            fill={fill}
          />
        </g>
        <g transform="translate(35.136)">
          <path
            d="M206.292,0h-3.66A4.032,4.032,0,0,0,198.6,4.033V6.2a4.032,4.032,0,0,0,4.033,4.033h3.66A4.032,4.032,0,0,0,210.325,6.2V4.033A4.048,4.048,0,0,0,206.292,0Zm2.813,5.776a3.253,3.253,0,0,1-1.593,2.788c-.025.025-.1,0-.1-.124v-6.6c0-.174.1-.149.149-.124a3.189,3.189,0,0,1,1.519,2.738V5.776Z"
            transform="translate(-184.295)"
            fill={fill}
          />
          <path
            d="M141.152,14.617a.665.665,0,0,0,.124.523c.224.4.747,1.17.971,1.494a.407.407,0,0,0,.373.149h11.725c.124,0,.2-.1.2-.249V13.049c0-.075-.1-.075-.124-.05a.332.332,0,0,1-.5,0c-.149-.124-.224-.2-.373-.2a.46.46,0,0,0-.448.448.545.545,0,0,1-.5.548c-.274,0-1.195-.025-1.593-.025a1.053,1.053,0,0,0-.921.523,1.068,1.068,0,0,1-1,.249c-.274-.1-.622-.523-1.07-.523a1.1,1.1,0,0,0-.921.6c-.224.324-.423.324-.573.2s-.423-.523-.772-.523c-.249,0-.423.124-.7.4a.419.419,0,0,1-.647,0,.7.7,0,0,0-.622-.373c-.4,0-.6.349-.8.4a.589.589,0,0,1-.5-.05,2.924,2.924,0,0,0-.672-.373A.525.525,0,0,0,141.152,14.617Z"
            transform="translate(-141.136 -9.613)"
            fill={fill}
          />
        </g>
        <path
          d="M95.3,24.6H62.959v1.046H95.3a3.23,3.23,0,0,1,3.236,3.236V44.491A3.23,3.23,0,0,1,95.3,47.727H4.282a3.23,3.23,0,0,1-3.236-3.236V28.882a3.23,3.23,0,0,1,3.236-3.236H34.205l-.7-1.046H4.282A4.282,4.282,0,0,0,0,28.882V44.491a4.282,4.282,0,0,0,4.282,4.282H95.3a4.282,4.282,0,0,0,4.282-4.282V28.882A4.282,4.282,0,0,0,95.3,24.6Z"
          transform="translate(0 -18.476)"
          fill={fill}
        />
      </svg>
    </MarkSlot>
  );
}

const TRUST_ITEMS: TrustItem[] = [
  {
    label: "Financiamiento Autofin",
    detail: "Crédito automotriz online",
    mark: <AutofinMark />,
  },
  {
    label: "Informe Autofact",
    detail: "Historial y dominio al día",
    mark: <AutofactMark />,
  },
  {
    label: "Inspección 150 puntos",
    detail: "Revisión mecánica previa",
    mark: (
      <TrustIcon>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M9 12l2.2 2.2L16 9.5" stroke={G} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M8 4h8l1.5 2.5H20v12.5A1.5 1.5 0 0118.5 20.5h-13A1.5 1.5 0 014 19V6.5h2.5L8 4z"
            stroke={G}
            strokeWidth="1.55"
            strokeLinejoin="round"
          />
        </svg>
      </TrustIcon>
    ),
  },
  {
    label: "Fotos reales de patio",
    detail: "Cada unidad fotografiada",
    mark: (
      <TrustIcon>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3.5" y="6.5" width="17" height="12.5" rx="2.2" stroke={G} strokeWidth="1.55" />
          <circle cx="12" cy="12.8" r="3.1" stroke={G} strokeWidth="1.55" />
          <path d="M8 6.5l1.2-2h5.6L16 6.5" stroke={G} strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </TrustIcon>
    ),
  },
  {
    label: "Showroom Puerto Montt",
    detail: "Av. Cardonal · visita y retiro",
    mark: (
      <TrustIcon>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0012 4.3a6.5 6.5 0 00-6.5 6.5C5.5 15.6 12 21 12 21z"
            stroke={G}
            strokeWidth="1.55"
          />
          <circle cx="12" cy="10.8" r="2.2" stroke={G} strokeWidth="1.55" />
        </svg>
      </TrustIcon>
    ),
  },
  {
    label: "Stock verificado",
    detail: "Papeles y kilometraje auditados",
    mark: (
      <TrustIcon>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3.5l7 2.6v5.6c0 4.4-2.9 7.5-7 9.3-4.1-1.8-7-4.9-7-9.3V6.1l7-2.6z"
            stroke={G}
            strokeWidth="1.55"
            strokeLinejoin="round"
          />
          <path d="M9.2 12.1l1.9 1.9 3.8-3.9" stroke={G} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </TrustIcon>
    ),
  },
  {
    label: "Asesoría personalizada",
    detail: "Te guiamos en toda la compra",
    mark: (
      <TrustIcon>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M8.5 18.5c.8-2.6 2.8-4 5-4h.8c2.2 0 4.2 1.4 5 4" stroke={G} strokeWidth="1.55" strokeLinecap="round" />
          <circle cx="13.8" cy="9.2" r="2.8" stroke={G} strokeWidth="1.55" />
          <path d="M5.5 17.8c.6-2 2-3.1 3.7-3.1" stroke={G} strokeWidth="1.55" strokeLinecap="round" />
          <circle cx="7.8" cy="10.2" r="2.2" stroke={G} strokeWidth="1.55" />
        </svg>
      </TrustIcon>
    ),
  },
  {
    label: "Prueba de manejo",
    detail: "Agenda tu test drive",
    mark: (
      <TrustIcon>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8.2" stroke={G} strokeWidth="1.6" />
          <circle cx="12" cy="12" r="2" fill={GS} />
          <path d="M12 4.8v4.2M5.6 15.2l3.4-2M18.4 15.2l-3.4-2" stroke={G} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6.2 9.2c1.5 1.1 3.5 1.8 5.8 1.8s4.3-.7 5.8-1.8" stroke={G} strokeWidth="1.45" strokeLinecap="round" />
        </svg>
      </TrustIcon>
    ),
  },
];

function TrustCard({ item }: { item: TrustItem }) {
  return (
    <article className="flex w-[158px] shrink-0 flex-col items-center rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent px-2.5 py-2.5 text-center transition duration-300 hover:border-[#C9A84C]/22 hover:from-white/[0.055] sm:w-[186px] sm:px-3.5 sm:py-3">
      <h3 className="text-[11px] font-semibold leading-tight tracking-tight text-white/95 sm:text-[12px]">
        {item.label}
      </h3>
      <p className="mt-1 text-[10px] leading-snug text-white/40 sm:text-[10.5px]">{item.detail}</p>
      <div className="mt-2 w-full sm:mt-2.5">{item.mark}</div>
    </article>
  );
}

export default function TrustMarquee() {
  const loop = [...TRUST_ITEMS, ...TRUST_ITEMS];

  return (
    <section
      aria-label="Beneficios y respaldo RG Motors"
      className="relative overflow-hidden border-b border-white/[0.06] bg-[#08090d]"
    >
      <GoldDefs />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#08090d] to-transparent sm:w-20" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#08090d] to-transparent sm:w-20" />

      <div className="rg-marquee-track group flex w-max gap-2.5 py-2.5 pl-2.5 hover:[animation-play-state:paused] sm:gap-3 sm:py-3 sm:pl-3">
        {loop.map((item, i) => (
          <TrustCard key={`${item.label}-${i}`} item={item} />
        ))}
      </div>
    </section>
  );
}
