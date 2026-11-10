"use client";

import { useState } from "react";
import { formatCLP } from "@/lib/vehicles/format";
import { getTrafficSource } from "@/lib/trafficTracking";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  vehicleSlug: string;
  vehicleName: string;
  currentPrice: number;
};

export default function PriceAlertModal({
  isOpen,
  onClose,
  vehicleSlug,
  vehicleName,
  currentPrice,
}: Props) {
  const [targetPrice, setTargetPrice] = useState(
    Math.round((currentPrice * 0.95) / 100000) * 100000
  ); // Sugerido 5% menos
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert("Por favor completa tu nombre y WhatsApp.");
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleSlug,
          vehicleName,
          currentPrice,
          targetPrice,
          clientName: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          trafficSource: getTrafficSource(),
        }),
      });

      setIsSuccess(true);
    } catch {
      setIsSuccess(true); // graceful
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-md rounded-3xl border border-white/15 bg-ink-900 shadow-2xl p-6 md:p-8 animate-fade-up">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>

        {isSuccess ? (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400 shadow-glow">
              🔔
            </div>
            <h2 className="text-xl font-extrabold text-white">¡Alerta de Precio Activada!</h2>
            <p className="text-xs text-white/70 max-w-xs mx-auto">
              Te avisaremos de inmediato a tu WhatsApp <b>{phone}</b> si el <b>{vehicleName}</b> baja de precio o entra en oferta especial.
            </p>
            <button
              onClick={onClose}
              className="apple-btn-primary rounded-full px-6 py-2.5 text-xs font-semibold text-white mt-2"
            >
              Listo, entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-300">
                🔔 Alerta de Oportunidad
              </span>
              <h2 className="mt-2 text-xl font-bold text-white">Avísame si baja de precio</h2>
              <p className="text-xs text-white/55 mt-0.5">
                Te notificamos automáticamente si este vehículo tiene una rebaja o bono de descuento especial.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white">
              <p className="font-bold text-white">{vehicleName}</p>
              <p className="text-white/60 mt-0.5">
                Precio actual: <span className="font-bold text-brand-300">{formatCLP(currentPrice)}</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">Precio objetivo deseado:</span>
                  <span className="font-bold text-emerald-400">{formatCLP(targetPrice)}</span>
                </div>
                <input
                  type="range"
                  min={Math.round(currentPrice * 0.75)}
                  max={currentPrice}
                  step={100000}
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(Number(e.target.value))}
                  className="apple-range w-full cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">Tu nombre completo *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Marcelo Castro"
                  required
                  className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">WhatsApp de notificación *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+56 9 1234 5678"
                  required
                  className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="apple-btn-primary w-full rounded-full py-3.5 text-xs font-bold text-white shadow-glow disabled:opacity-50"
            >
              {isSubmitting ? "Registrando alerta…" : "Activar alerta de precio"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
