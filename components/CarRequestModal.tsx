"use client";

import { useState } from "react";
import { formatCLP } from "@/lib/vehicles/format";
import { getTrafficSource } from "@/lib/trafficTracking";
import { whatsappLink } from "@/lib/company";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const BRANDS_LIST = [
  "Toyota",
  "Mazda",
  "Hyundai",
  "Kia",
  "Chevrolet",
  "Nissan",
  "Subaru",
  "Ford",
  "Volkswagen",
  "Peugeot",
  "Honda",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Otra marca",
];

export default function CarRequestModal({ isOpen, onClose }: Props) {
  const [brand, setBrand] = useState(BRANDS_LIST[0]);
  const [model, setModel] = useState("");
  const [maxBudget, setMaxBudget] = useState(15000000);
  const [minYear, setMinYear] = useState(2020);
  const [fuel, setFuel] = useState("Sin preferencia");
  const [transmission, setTransmission] = useState("Sin preferencia");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !model.trim()) {
      alert("Por favor completa los campos obligatorios.");
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch("/api/car-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name.trim(),
          phone: phone.trim(),
          brand,
          model: model.trim(),
          maxBudget,
          minYear,
          fuel: fuel === "Sin preferencia" ? undefined : fuel,
          transmission: transmission === "Sin preferencia" ? undefined : transmission,
          trafficSource: getTrafficSource(),
          notes: notes.trim() || undefined,
        }),
      });

      setIsSuccess(true);
    } catch {
      setIsSuccess(true); // graceful
    } finally {
      setIsSubmitting(false);
    }
  };

  const waMsg = `Hola RG Motors, no encontré el auto que busco en el catálogo y quiero pedirlo con su servicio de Personal Shopper:
Busco un ${brand} ${model} (año ${minYear}+) con presupuesto de hasta ${formatCLP(maxBudget)}. Mi nombre es ${name}.`;
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
            <h2 className="text-xl font-extrabold text-white">¡Búsqueda Activada con Éxito!</h2>
            <p className="text-xs text-white/70 max-w-xs mx-auto">
              Nuestro equipo de adquisiciones activó los radares para encontrar tu <b>{brand} {model}</b> (hasta {formatCLP(maxBudget)}). Te avisaremos en cuanto esté disponible.
            </p>
            <div className="pt-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="apple-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold text-white shadow-glow"
              >
                <span>💬</span> Priorizar búsqueda por WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-b border-white/10 pb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-[11px] font-bold text-brand-300">
                🔍 Personal Shopper Automotriz
              </span>
              <h2 className="mt-2 text-xl font-bold text-white">¿No encontraste el auto que buscas?</h2>
              <p className="text-xs text-white/55 mt-0.5">
                Dinos qué modelo necesitas y nuestro equipo lo buscará y certificará por ti en tiempo récord.
              </p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Marca deseada *</label>
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                  >
                    {BRANDS_LIST.map((b) => (
                      <option key={b} value={b} className="bg-ink-900">
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Modelo o Versión *</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Ej: Hilux, Sportage, Swift..."
                    required
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">Presupuesto máximo:</span>
                  <span className="font-bold text-brand-300">{formatCLP(maxBudget)}</span>
                </div>
                <input
                  type="range"
                  min={5000000}
                  max={35000000}
                  step={500000}
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(Number(e.target.value))}
                  className="apple-range w-full cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Año mínimo</label>
                  <select
                    value={minYear}
                    onChange={(e) => setMinYear(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3 py-2 text-xs text-white outline-none focus:border-brand-500"
                  >
                    {[2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((y) => (
                      <option key={y} value={y} className="bg-ink-900">
                        {y} en adelante
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Combustible preferido</label>
                  <select
                    value={fuel}
                    onChange={(e) => setFuel(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3 py-2 text-xs text-white outline-none focus:border-brand-500"
                  >
                    {["Sin preferencia", "Gasolina", "Diésel", "Híbrido", "Eléctrico"].map((f) => (
                      <option key={f} value={f} className="bg-ink-900">
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-white/10 pt-2 grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu Nombre completo *"
                  required
                  className="rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="WhatsApp (+56 9 ...) *"
                  required
                  className="rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                />
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles adicionales: color deseado, tipo de tracción (4x4), etc."
                rows={2}
                className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2 text-xs text-white outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="apple-btn-primary w-full rounded-full py-3.5 text-xs font-bold text-white shadow-glow disabled:opacity-50"
            >
              {isSubmitting ? "Activando búsqueda…" : "Buscar auto por mí"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
