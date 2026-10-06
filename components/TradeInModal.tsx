"use client";

import { useState } from "react";
import { formatCLP } from "@/lib/vehicles";
import { getTrafficSource } from "@/lib/trafficTracking";
import { trackEvent } from "@/lib/googleAnalytics";
import { whatsappLink } from "@/lib/company";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  targetVehicleName?: string;
  targetVehicleSlug?: string;
  targetVehiclePrice?: number;
};

export default function TradeInModal({
  isOpen,
  onClose,
  targetVehicleName,
  targetVehicleSlug,
  targetVehiclePrice,
}: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(2018);
  const [km, setKm] = useState(65000);
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !brand || !model) {
      setErrorMsg("Por favor completa los datos obligatorios.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/trade-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name,
          phone,
          email,
          brand,
          model,
          year,
          km,
          targetVehicleSlug,
          trafficSource: getTrafficSource(),
          notes,
        }),
      });

      if (!res.ok) throw new Error("Error al enviar tasación.");

      trackEvent("generate_lead", { form_name: "tasacion" });
      setIsSuccess(true);
    } catch {
      setErrorMsg("No se pudo enviar la solicitud. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const waMsg = `Hola RG Motors, quiero entregar mi auto en parte de pago: ${brand} ${model} año ${year} (${km.toLocaleString("es-CL")} km)${
    targetVehicleName ? ` para comprar el ${targetVehicleName}` : ""
  }. Mi nombre es ${name}.`;
  const waUrl = whatsappLink(waMsg);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-ink-900 shadow-2xl p-6 md:p-8 animate-fade-up">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>

        {isSuccess ? (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400 shadow-glow">
              ✓
            </div>
            <h2 className="text-xl font-extrabold text-white">¡Solicitud de Tasación Recibida!</h2>
            <p className="text-xs text-white/70 max-w-xs mx-auto">
              Un tasador oficial de RG Motors evaluará tu <b>{brand} {model} ({year})</b> y te contactará en breve al {phone}.
            </p>
            <div className="pt-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="apple-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold text-white shadow-glow"
              >
                <span>💬</span> Agilizar tasación por WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-400">
                Tasación Online RG Motors
              </span>
              <h2 className="text-xl font-bold text-white">Entrega tu auto en parte de pago</h2>
              <p className="text-xs text-white/50 mt-0.5">
                Recibimos tu vehículo actual al mejor precio de mercado para abonar a tu nuevo auto.
              </p>
            </div>

            {targetVehicleName && (
              <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-3 text-xs text-white/80">
                Auto que deseas comprar: <span className="font-bold text-white">{targetVehicleName}</span>
                {targetVehiclePrice && ` (${formatCLP(targetVehiclePrice)})`}
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <p className="text-xs font-bold text-white/70 uppercase tracking-wide">Datos de tu auto actual</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Marca (ej: Chevrolet)"
                  required
                  className="rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                />
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Modelo (ej: Sail)"
                  required
                  className="rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Año</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value, 10))}
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Kilometraje (km)</label>
                  <input
                    type="number"
                    value={km}
                    onChange={(e) => setKm(parseInt(e.target.value, 10))}
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <p className="text-xs font-bold text-white/70 uppercase tracking-wide pt-2">Tus datos de contacto</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu Nombre completo *"
                  required
                  className="rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="WhatsApp (+56 9 ...) *"
                  required
                  className="rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
                />
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles adicionales: versión, estado de pintura, mantenciones, etc."
                rows={2}
                className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="apple-btn-primary w-full rounded-full py-3 text-xs font-bold text-white shadow-glow disabled:opacity-50"
            >
              {isSubmitting ? "Enviando solicitud…" : "Enviar para tasación gratuita"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
