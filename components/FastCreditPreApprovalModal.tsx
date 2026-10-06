"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { formatCLP, vehicles as staticVehicles, Vehicle } from "@/lib/vehicles";
import { formatRut, validateRut, evaluateCreditCapacity } from "@/lib/rut";
import { asset } from "@/lib/asset";
import { getTrafficSource } from "@/lib/trafficTracking";
import { trackEvent } from "@/lib/googleAnalytics";
import { whatsappLink } from "@/lib/company";
import LegalConsentCheckbox from "@/components/LegalConsentCheckbox";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  targetVehicle?: Vehicle;
};

const EMPLOYMENT_TYPES = [
  "Trabajador Dependiente (Contrato indefinido)",
  "Trabajador Dependiente (Contrato a plazo)",
  "Independiente / Honorarios",
  "Empresario / Dueño de Empresa",
  "Jubilado / Pensionado",
];

export default function FastCreditPreApprovalModal({
  isOpen,
  onClose,
  targetVehicle,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [rut, setRut] = useState("");
  const [rutError, setRutError] = useState("");
  const [income, setIncome] = useState(1200000); // Renta líquida por defecto $1.2M
  const [downPayment, setDownPayment] = useState(targetVehicle ? Math.round(targetVehicle.price * 0.2) : 2500000);
  const [term, setTerm] = useState(48);
  const [employmentType, setEmploymentType] = useState(EMPLOYMENT_TYPES[0]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [consent, setConsent] = useState(false);
  const [vehiclesData, setVehiclesData] = useState<Vehicle[]>(staticVehicles);
  const [result, setResult] = useState<{
    maxFinanced: number;
    totalPurchasingPower: number;
    maxMonthlyQuota: number;
    id: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/vehicles?fields=card")
        .then((r) => r.json())
        .then((data) => {
          if (data && data.vehicles) setVehiclesData(data.vehicles);
        })
        .catch(console.error);
    }
  }, [isOpen]);

  const evaluation = useMemo(() => {
    return evaluateCreditCapacity(income, downPayment, term);
  }, [income, downPayment, term]);

  const matchingVehicles = useMemo(() => {
    if (!evaluation) return [];
    return vehiclesData
      .filter((v) => v.price <= evaluation.totalPurchasingPower * 1.05)
      .slice(0, 3);
  }, [evaluation, vehiclesData]);

  if (!isOpen) return null;

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRut(e.target.value);
    setRut(formatted);
    if (formatted.length >= 8) {
      if (!validateRut(formatted)) {
        setRutError("RUT inválido (verifica el dígito verificador).");
      } else {
        setRutError("");
      }
    } else {
      setRutError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRut(rut)) {
      setRutError("Por favor ingresa un RUT válido.");
      return;
    }
    if (!name.trim() || !phone.trim() || !email.trim()) {
      alert("Por favor completa tu nombre, correo electrónico y teléfono.");
      return;
    }
    if (!consent) {
      setSubmitError("Debes aceptar la política de privacidad y el aviso de crédito.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name.trim(),
          rut: rut.trim(),
          phone: phone.trim(),
          email: email.trim(),
          vehicleSlug: targetVehicle?.slug || "simulacion-general",
          downPct: Math.round((downPayment / (targetVehicle?.price || evaluation.totalPurchasingPower)) * 100),
          downPayment,
          term,
          monthlyEstimate: evaluation.maxMonthlyQuota,
          income,
          employmentType,
          maxApprovedAmount: evaluation.totalPurchasingPower,
          status: "En evaluación",
          trafficSource: getTrafficSource(),
          notes: `Simulación de crédito enviada por ${name} (RUT: ${rut}). Vehículo: ${targetVehicle?.brand || "General"} ${targetVehicle?.model || ""}. Renta: ${formatCLP(income)}. Pie: ${formatCLP(downPayment)}. Plazo: ${term} meses.`,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.credit?.id) {
        setSubmitError(data.error || "No se pudo enviar la simulación. Intenta nuevamente.");
        return;
      }

      setResult({
        maxFinanced: evaluation.maxFinanced,
        totalPurchasingPower: evaluation.totalPurchasingPower,
        maxMonthlyQuota: evaluation.maxMonthlyQuota,
        id: data.credit.id,
      });
      trackEvent("generate_lead", { form_name: "credito" });
      setStep(2);
    } catch {
      setSubmitError("Error de conexión. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const waCertMsg = `Hola RG Motors, acabo de enviar una Simulación de Crédito Online (${result?.id}).
Mi nombre es ${name} (RUT: ${rut}) y solicito financiamiento para ${
    targetVehicle ? `el ${targetVehicle.brand} ${targetVehicle.model}` : "comprar un vehículo"
  } con pie de ${formatCLP(downPayment)} en ${term} cuotas. Mi correo es ${email}. ¿Me pueden asesorar?`;
  const waCertUrl = whatsappLink(waCertMsg);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl border border-white/15 bg-ink-900 shadow-2xl p-6 md:p-8 animate-fade-up my-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>

        {step === 1 ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-b border-white/10 pb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-[11px] font-bold text-brand-300">
                ⚡ Simulación de Crédito Automotriz
              </span>
              <h2 className="mt-2 text-xl font-bold text-white">Simula tu Crédito en Línea</h2>
              <p className="text-xs text-white/60 mt-1">
                Completa tus datos y condiciones. Un asesor te responderá a la brevedad por
                correo con la orientación de tu simulación.
              </p>
            </div>

            {targetVehicle && (
              <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-3 text-xs text-white flex items-center justify-between">
                <span>Vehículo a financiar: <b>{targetVehicle.brand} {targetVehicle.model}</b></span>
                <span className="font-extrabold text-brand-300">{formatCLP(targetVehicle.price)}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">RUT del solicitante *</label>
                  <input
                    type="text"
                    value={rut}
                    onChange={handleRutChange}
                    placeholder="12.345.678-9"
                    required
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-white outline-none bg-ink-950 ${
                      rutError ? "border-red-500" : "border-white/15 focus:border-brand-500"
                    }`}
                  />
                  {rutError && <p className="text-[10px] text-red-400 mt-1">{rutError}</p>}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">Situación Laboral</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-ink-900">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">Tu renta líquida mensual demostrable:</span>
                  <span className="font-bold text-brand-300 text-sm">{formatCLP(income)}</span>
                </div>
                <input
                  type="range"
                  min={500000}
                  max={4500000}
                  step={50000}
                  value={income}
                  onChange={(e) => setIncome(Number(e.target.value))}
                  className="apple-range w-full cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">Pie o ahorro inicial disponible:</span>
                  <span className="font-bold text-brand-300 text-sm">{formatCLP(downPayment)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12000000}
                  step={200000}
                  value={downPayment}
                  onChange={(e) => setDownPayment(Number(e.target.value))}
                  className="apple-range w-full cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">Plazo preferido:</span>
                  <span className="font-bold text-brand-300 text-sm">{term} meses ({term / 12} años)</span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={60}
                  step={12}
                  value={term}
                  onChange={(e) => setTerm(Number(e.target.value))}
                  className="apple-range w-full cursor-pointer"
                />
              </div>

              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-3.5 text-xs text-white">
                <div className="flex items-center justify-between">
                  <span className="text-brand-200 font-semibold">Cuota mensual estimada:</span>
                  <span className="text-base font-extrabold text-brand-300">
                    {formatCLP(evaluation.maxMonthlyQuota)}/mes
                  </span>
                </div>
                <p className="text-[10px] text-white/50 mt-1">
                  Monto financiable aprox: {formatCLP(evaluation.maxFinanced)} a {term} meses.
                </p>
              </div>

              {/* Contact Information */}
              <div className="border-t border-white/10 pt-3 space-y-2.5">
                <p className="text-[11px] font-semibold text-white/70">Datos de contacto para responderte:</p>
                <div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu Nombre y Apellido *"
                    required
                    className="w-full rounded-xl border border-white/15 bg-ink-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-brand-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Correo Electrónico (para recibir simulación) *"
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
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
                {submitError}
              </div>
            )}

            <LegalConsentCheckbox
              checked={consent}
              onChange={setConsent}
              strict
              id="fast-credit-consent"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="apple-btn-primary mt-2 w-full rounded-full py-3.5 text-xs font-bold text-white shadow-glow disabled:opacity-50"
            >
              {isSubmitting ? "Enviando simulación…" : "Enviar simulación de crédito"}
            </button>

            <p className="mt-2 text-center text-[10px] leading-relaxed text-white/45">
              Simulación referencial conforme a Ley N° 19.496 (SERNAC). No constituye
              aprobación de crédito ni oferta vinculante; está sujeta a evaluación de Autofin
              u otras entidades asociadas.
            </p>
          </form>
        ) : (
          <div className="space-y-5 text-center py-2 animate-fade-up">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/20 text-3xl font-bold text-brand-300 shadow-glow">
              ✓
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-300">
                Simulación enviada N° {result?.id}
              </span>
              <h2 className="text-2xl font-extrabold text-white mt-1">Simulación enviada</h2>
              <p className="text-xs text-white/60 mt-1.5 max-w-md mx-auto leading-relaxed">
                Recibimos tu simulación, <b>{name}</b>. Está sujeta a evaluación Autofin (u otra financiera asociada). Te responderemos a la brevedad a <b>{email}</b>.
              </p>
            </div>

            <div className="rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-600/20 via-ink-950 to-black p-5 text-left space-y-3">
              <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
                <span className="text-xs text-white/70">Cuota Mensual Estimada:</span>
                <span className="text-2xl font-extrabold text-brand-300">{formatCLP(result?.maxMonthlyQuota || 0)}/mes</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                <div>
                  <p className="text-[10px] text-white/40">Monto Financiable:</p>
                  <p className="font-bold text-white">{formatCLP(result?.maxFinanced || 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/40">Plazo Simulado:</p>
                  <p className="font-bold text-white">{term} meses ({term / 12} años)</p>
                </div>
              </div>
            </div>

            {matchingVehicles.length > 0 && (
              <div className="text-left space-y-2 pt-1">
                <p className="text-xs font-bold text-white/70 uppercase tracking-wide">
                  Modelos sugeridos para tu presupuesto:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {matchingVehicles.map((mv) => (
                    <Link
                      key={mv.slug}
                      href={`/vehiculo/${mv.slug}`}
                      onClick={onClose}
                      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 transition hover:border-brand-500/50 hover:bg-brand-500/10 block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={asset(mv.image)} alt={mv.model} className="h-16 w-full object-cover rounded-xl mb-1.5" />
                      <p className="text-[11px] font-bold text-white truncate">{mv.brand} {mv.model}</p>
                      <p className="text-[10px] font-bold text-brand-300">{formatCLP(mv.price)}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={waCertUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="apple-btn-primary flex-1 inline-flex items-center justify-center gap-2 rounded-full py-3.5 text-xs font-bold text-white shadow-glow"
              >
                <span>💬</span> Consultar directo por WhatsApp
              </a>
              <button
                onClick={onClose}
                className="apple-btn-secondary rounded-full px-6 py-3 text-xs font-semibold text-white/70 hover:text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
