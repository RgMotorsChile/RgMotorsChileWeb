"use client";

import { useState } from "react";
import Link from "next/link";
import { Vehicle, formatCLP } from "@/lib/vehicles";
import { whatsappLink } from "@/lib/company";
import TradeInModal from "./TradeInModal";
import VehiclePdfButton from "./VehiclePdfButton";
import PriceAlertModal from "./PriceAlertModal";

export default function VehicleActionButtons({ vehicle: v }: { vehicle: Vehicle }) {
  const [isTradeInOpen, setIsTradeInOpen] = useState(false);
  const [isPriceAlertOpen, setIsPriceAlertOpen] = useState(false);

  return (
    <>
      <div className="space-y-2.5">
        <a
          href={whatsappLink(
            `Hola RG Motors, me interesa el ${v.brand} ${v.model} ${v.year} publicado en ${formatCLP(v.price)}. ¿Me pueden brindar más información y disponibilidad?`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 text-center text-[14px] font-bold text-white shadow-sm transition hover:bg-[#20bd5a] hover:scale-[1.01] active:scale-95"
        >
          Hablar con un asesor por WhatsApp
        </a>

        <button
          onClick={() => setIsTradeInOpen(true)}
          className="apple-btn-secondary flex min-h-11 w-full items-center justify-center gap-2 rounded-full py-3 text-center text-[13px] font-semibold text-white transition hover:border-brand-400/50"
        >
          Dejar mi auto en parte de pago
        </button>

        <Link
          href={`/prueba-manejo/${v.slug}`}
          className="apple-btn-secondary flex min-h-11 w-full items-center justify-center rounded-full py-3 text-center text-[13px] font-semibold text-white/85"
        >
          Agendar prueba de manejo
        </Link>

        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          <VehiclePdfButton vehicle={v} className="w-full !text-[13px] !px-3 !min-h-11" />
          <button
            onClick={() => setIsPriceAlertOpen(true)}
            className="apple-btn-secondary flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border-amber-400/20 py-3 text-center text-[13px] font-medium text-amber-300/90 transition hover:border-amber-400/50 hover:bg-amber-400/5"
          >
            Alerta de precio
          </button>
        </div>
      </div>

      <TradeInModal
        isOpen={isTradeInOpen}
        onClose={() => setIsTradeInOpen(false)}
        targetVehicleName={`${v.brand} ${v.model} (${v.year})`}
        targetVehicleSlug={v.slug}
        targetVehiclePrice={v.price}
      />

      <PriceAlertModal
        isOpen={isPriceAlertOpen}
        onClose={() => setIsPriceAlertOpen(false)}
        vehicleSlug={v.slug}
        vehicleName={`${v.brand} ${v.model} ${v.year}`}
        currentPrice={v.price}
      />
    </>
  );
}
