"use client";

import { useState } from "react";
import Link from "next/link";
import { whatsappLink } from "@/lib/company";
import LegalConsentCheckbox from "@/components/LegalConsentCheckbox";

type Status = "idle" | "sending" | "sent" | "fallback";

const inputCls =
  "mt-1.5 w-full min-w-0 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition placeholder-white/35 focus:border-brand-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-brand-500/20";

/** Formulario de consignación → /api/consigna (Resend). Sin correo, ofrece WhatsApp. */
export default function ConsignaForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [f, setF] = useState({
    name: "",
    phone: "",
    email: "",
    brand: "",
    model: "",
    year: "",
    km: "",
    message: "",
    website: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const waText = `Hola RG Motors, quiero consignar mi vehículo${
    f.brand || f.model ? `: ${f.brand} ${f.model} ${f.year}`.trimEnd() : ""
  }${f.km ? `, ${f.km} km` : ""}.${f.name ? ` Soy ${f.name}.` : ""}`;

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6 text-center sm:p-8" role="status">
        <p className="text-lg font-bold text-emerald-300">Solicitud enviada</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
          Gracias{f.name ? `, ${f.name}` : ""}. Revisamos tu {f.brand} {f.model} y te contactamos en horario hábil.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate={false}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!consent) {
          setError("Debes aceptar la política de privacidad para continuar.");
          return;
        }
        setStatus("sending");
        setError("");
        try {
          const res = await fetch("/api/consigna", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(f),
          });
          const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
          if (res.ok && data.success) {
            setStatus("sent");
            return;
          }
          if (res.status >= 500) {
            setStatus("fallback");
            setError(data.error || "No pudimos enviar tu solicitud. Escríbenos por WhatsApp.");
            return;
          }
          setStatus("idle");
          setError(data.error || "Revisa los datos e intenta de nuevo.");
        } catch {
          setStatus("fallback");
          setError("Error de conexión. Escríbenos por WhatsApp y te respondemos de inmediato.");
        }
      }}
    >
      <input
        type="text"
        name="website"
        value={f.website}
        onChange={set("website")}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          <p>{error}</p>
          {status === "fallback" && (
            <a
              href={whatsappLink(waText)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-[#25D366] px-5 text-sm font-bold text-white"
            >
              Enviar por WhatsApp
            </a>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-white/70">
          Nombre
          <input required maxLength={80} autoComplete="name" value={f.name} onChange={set("name")} className={inputCls} placeholder="Tu nombre" />
        </label>
        <label className="block text-xs font-semibold text-white/70">
          Teléfono
          <input required type="tel" maxLength={30} autoComplete="tel" value={f.phone} onChange={set("phone")} className={inputCls} placeholder="+56 9 1234 5678" />
        </label>
      </div>
      <label className="block text-xs font-semibold text-white/70">
        Correo
        <input required type="email" maxLength={120} autoComplete="email" value={f.email} onChange={set("email")} className={inputCls} placeholder="tucorreo@ejemplo.com" />
      </label>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="block text-xs font-semibold text-white/70">
          Marca
          <input required maxLength={40} value={f.brand} onChange={set("brand")} className={inputCls} placeholder="Toyota" />
        </label>
        <label className="block text-xs font-semibold text-white/70">
          Modelo
          <input required maxLength={60} value={f.model} onChange={set("model")} className={inputCls} placeholder="Hilux" />
        </label>
        <label className="block text-xs font-semibold text-white/70">
          Año
          <input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={f.year} onChange={set("year")} className={inputCls} placeholder="2021" />
        </label>
        <label className="block text-xs font-semibold text-white/70">
          Kilometraje
          <input inputMode="numeric" maxLength={9} value={f.km} onChange={set("km")} className={inputCls} placeholder="85000" />
        </label>
      </div>
      <label className="block text-xs font-semibold text-white/70">
        Mensaje
        <textarea rows={3} maxLength={1500} value={f.message} onChange={set("message")} className={inputCls} placeholder="Estado, mantenciones, precio esperado…" />
      </label>
      <LegalConsentCheckbox checked={consent} onChange={setConsent} id="consigna-consent" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={status === "sending"}
          className="apple-btn-primary inline-flex min-h-12 items-center justify-center rounded-full px-8 text-sm font-bold text-white disabled:opacity-50"
        >
          {status === "sending" ? "Enviando…" : "Enviar solicitud"}
        </button>
        <a
          href={whatsappLink(waText)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-white/85 hover:border-white/30"
        >
          Prefiero WhatsApp
        </a>
      </div>
      <p className="text-[11px] text-white/35">
        Usamos tus datos solo para contactarte por esta consignación.{" "}
        <Link href="/privacidad" className="text-brand-300 hover:underline">Privacidad</Link>.
      </p>
    </form>
  );
}
