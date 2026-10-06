"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { COMPANY, whatsappLink } from "@/lib/company";

export default function CuentaPage() {
  const waUrl = whatsappLink(
    "Hola RG Motors, quiero información sobre un vehículo / mi solicitud."
  );

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="border-b border-white/10 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/">
            <Logo size={32} tagline={false} />
          </Link>
          <Link href="/" className="text-sm text-white/50 hover:text-white">
            ← Volver al sitio
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
        <div className="apple-glass-card w-full rounded-3xl border border-white/10 p-8 space-y-5">
          <span className="inline-flex rounded-full border border-brand-400/30 bg-brand-400/10 px-3 py-1 text-[11px] font-bold text-brand-300">
            Portal de cliente
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Próximamente</h1>
          <p className="text-sm leading-relaxed text-white/60">
            El portal de cliente aún no está activo. Mientras tanto, puedes revisar el
            catálogo, contactarnos o escribirnos por WhatsApp para seguimiento de
            reservas o consultas.
          </p>

          <div className="flex flex-col gap-3 pt-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="apple-btn-primary rounded-full py-3 text-xs font-bold text-white shadow-glow"
            >
              WhatsApp · {COMPANY.phoneDisplay}
            </a>
            <Link
              href="/catalogo"
              className="apple-btn-secondary rounded-full py-3 text-xs font-semibold text-white"
            >
              Ver catálogo
            </Link>
            <Link
              href="/contacto"
              className="text-xs text-white/50 hover:text-white transition"
            >
              Ir a contacto →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
