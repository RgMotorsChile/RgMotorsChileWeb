"use client";

import { useState } from "react";
import Link from "next/link";
import { COMPANY, whatsappLink } from "@/lib/company";
import { getTrafficSource } from "@/lib/trafficTracking";
import { trackEvent } from "@/lib/googleAnalytics";
import LegalConsentCheckbox from "@/components/LegalConsentCheckbox";

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [consent, setConsent] = useState(false);

  if (sent) {
    return (
      <div className="apple-glass-card rounded-3xl p-8 text-center border-emerald-500/30">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-2xl text-emerald-400 font-bold shadow-glow">
          ✓
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-emerald-400">¡Mensaje enviado!</h2>
        <p className="mt-2 text-xs leading-relaxed text-white/70 max-w-md mx-auto">
          Gracias{name ? `, ${name}` : ""}. Un asesor de RG Motors te contactará en horario
          hábil al {phone || email}.
        </p>
        <a
          href={whatsappLink("Hola RG Motors, quiero más información sobre un vehículo.")}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-xs font-semibold text-white transition hover:brightness-110 shadow-sm"
        >
          Contactar por WhatsApp
        </a>
        <button
          onClick={() => setSent(false)}
          className="mt-4 block w-full text-xs text-white/40 hover:text-white transition-colors"
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  return (
    <form
      className="apple-glass-card rounded-3xl p-7 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!consent) {
          setError("Debes aceptar la política de privacidad para continuar.");
          return;
        }
        setLoading(true);
        setError("");
        setFallback(false);
        try {
          const res = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              phone,
              email,
              message,
              website: honeypot,
              trafficSource: getTrafficSource(),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            setError(data.error || "No se pudo enviar. Intenta de nuevo.");
            setFallback(res.status >= 500 || !res.ok);
            return;
          }
          trackEvent("generate_lead", { form_name: "contacto" });
          setSent(true);
        } catch {
          setError("Error de conexión. Intenta nuevamente o escríbenos por WhatsApp.");
          setFallback(true);
        } finally {
          setLoading(false);
        }
      }}
    >
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <p>{error}</p>
          {fallback && (
            <a
              href={whatsappLink(`Hola RG Motors, soy ${name || "un cliente"}. ${message}`.trim())}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-[#25D366] px-5 text-xs font-bold text-white"
            >
              Enviar por WhatsApp
            </a>
          )}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nombre completo" value={name} onChange={setName} placeholder="Ej. Carlos Silva" required />
        <Field label="Teléfono de contacto" value={phone} onChange={setPhone} placeholder="+56 9 1234 5678" required />
      </div>
      <Field
        label="Correo electrónico"
        value={email}
        onChange={setEmail}
        placeholder="tucorreo@ejemplo.com"
        type="email"
        required
      />
      <div>
        <label className="text-xs font-semibold text-white/70">Mensaje o consulta</label>
        <textarea
          rows={4}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="¿En qué te podemos asesorar?"
          className="mt-1.5 w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs text-white outline-none focus:border-brand-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-brand-500/20 transition placeholder-white/40"
        />
      </div>
      <LegalConsentCheckbox checked={consent} onChange={setConsent} id="contact-consent" />

      <button
        type="submit"
        disabled={loading}
        className="apple-btn-primary w-full rounded-full py-3.5 text-xs font-semibold text-white shadow-glow sm:w-auto sm:px-8 disabled:opacity-50"
      >
        {loading ? "Enviando…" : "Enviar mensaje"}
      </button>
      <p className="text-[10px] text-white/35">
        Horario de atención: {COMPANY.hours}. Más info en{" "}
        <Link href="/privacidad" className="text-brand-300 hover:underline">
          Privacidad
        </Link>
        .
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-white/70">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs text-white outline-none focus:border-brand-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-brand-500/20 transition placeholder-white/40"
      />
    </div>
  );
}
