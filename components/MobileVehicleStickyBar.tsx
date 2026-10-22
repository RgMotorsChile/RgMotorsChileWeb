"use client";

import { formatCLP, type Vehicle } from "@/lib/vehicles";
import { whatsappLink } from "@/lib/company";

/** Barra fija de contacto en ficha — solo móvil/tablet. */
export default function MobileVehicleStickyBar({ vehicle: v }: { vehicle: Vehicle }) {
  const wa = whatsappLink(
    `Hola RG Motors, me interesa el ${v.brand} ${v.model} ${v.year} publicado en ${formatCLP(v.price)}. ¿Me pueden brindar más información y disponibilidad?`,
  );

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#06070a]/94 px-3 pt-2.5 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 pr-[4.25rem] sm:pr-[4.75rem]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-white">
            {v.brand} {v.model}
          </p>
          <p className="text-[12px] font-semibold text-brand-300">{formatCLP(v.price)}</p>
        </div>
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="touch-target inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] px-4 text-[13px] font-bold text-[#052e16] active:scale-[0.98]"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
