"use client";

import { useState } from "react";
import Link from "next/link";
import { asset } from "@/lib/asset";
import { Vehicle, formatCLP } from "@/lib/vehicles";
import { getTrafficSource } from "@/lib/trafficTracking";
import { whatsappLink } from "@/lib/company";

const BRANCHES = ["Showroom Av. El Tepual (Puerto Montt)"];
const TIMES = ["10:00", "11:30", "12:30", "15:00", "16:30", "17:30"];

function daysOfMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // lunes = 0
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  return {
    cells,
    monthName: first.toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
    today: now.getDate(),
  };
}

export default function TestDriveForm({ vehicle: v }: { vehicle: Vehicle }) {
  const { cells, monthName, today } = daysOfMonth();
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [day, setDay] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canConfirm = !!(
    day &&
    time &&
    name.trim() &&
    phone.trim() &&
    email.trim() &&
    !isSubmitting
  );

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSubmitting(true);

    const traffic = getTrafficSource();
    const formattedDate = `${day} de ${monthName}`;

    try {
      // 1. Guardar en el store dedicado de Test Drives
      await fetch("/api/test-drives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleSlug: v.slug,
          vehicleTitle: `${v.brand} ${v.model} ${v.year}`,
          branch,
          date: formattedDate,
          time: `${time} hrs`,
          clientName: name.trim(),
          clientPhone: phone.trim(),
          clientEmail: email.trim(),
          trafficSource: traffic,
          notes: `Agendado en sucursal ${branch} a las ${time} hrs.`,
        }),
      });

      // 2. Enriquecer el lead en el motor de analítica
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: `td_${Date.now()}`,
          name: name.trim(),
          contact: phone.trim(),
          bodyType: v.bodyType,
          models: [v.slug],
          intents: ["prueba-manejo", `sucursal-${branch}`, `canal-${traffic.source}`],
        }),
      });
    } catch {
      /* ignore */
    } finally {
      setIsSubmitting(false);
      setDone(true);
    }
  };

  if (done) {
    const waMsg = `Hola RG Motors, acabo de agendar una prueba de manejo para el ${v.brand} ${v.model} ${v.year} el día ${day} de ${monthName} a las ${time} hrs en la sucursal ${branch}. Mi nombre es ${name}.`;

    return (
      <div className="apple-glass-card mx-auto max-w-xl rounded-3xl p-8 text-center border-emerald-500/30 animate-fade-up">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl font-bold text-emerald-400 shadow-glow">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-emerald-400">
          ¡Prueba de manejo agendada con éxito!
        </h2>
        <p className="mt-3 text-xs leading-relaxed text-white/70">
          Hola <b>{name}</b>, te esperamos el <b>{day} de {monthName}</b> a las{" "}
          <b>{time} hrs</b> en la sucursal <b>{branch}</b> para probar tu{" "}
          <b>{v.brand} {v.model}</b>. También te enviamos la confirmación a{" "}
          <b>{email}</b> (revisá spam si no la ves).
        </p>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 text-left text-xs space-y-2">
          <div className="flex justify-between border-b border-white/10 pb-2">
            <span className="text-white/50">Vehículo:</span>
            <span className="font-bold text-white">{v.brand} {v.model} ({v.year})</span>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-2">
            <span className="text-white/50">Sucursal:</span>
            <span className="font-bold text-brand-300">{branch}</span>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-2">
            <span className="text-white/50">Horario:</span>
            <span className="font-bold text-white">{day} de {monthName} · {time} hrs</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">Correo:</span>
            <span className="text-white/80">{email}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={whatsappLink(waMsg)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full sm:w-auto rounded-full bg-[#25D366] px-6 py-3.5 text-xs font-bold text-white transition hover:brightness-110 shadow-sm"
          >
            <span>💬</span> Confirmar al instante por WhatsApp
          </a>
          <Link
            href="/catalogo"
            className="apple-btn-secondary w-full sm:w-auto rounded-full px-6 py-3.5 text-xs font-semibold text-white"
          >
            Seguir explorando autos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] items-start">
      {/* Vehicle summary */}
      <div className="apple-glass-card rounded-3xl p-6 space-y-4">
        <div className="aspect-[16/10] overflow-hidden rounded-2xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset(v.image)} alt={v.model} className="h-full w-full object-cover" />
        </div>
        <div>
          <p className="text-base font-bold text-white">{v.brand} {v.model}</p>
          <p className="text-xs text-white/50">{v.version} · Año {v.year}</p>
          <p className="mt-2 text-2xl font-extrabold text-brand-300">{formatCLP(v.price)}</p>
        </div>
        <p className="text-xs text-white/60 leading-relaxed border-t border-white/10 pt-3">
          Prueba el vehículo en condiciones reales con asistencia de un especialista comercial de RG Motors.
        </p>
      </div>

      {/* Form */}
      <div className="apple-glass-card rounded-3xl p-7 space-y-6">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-white/70">Sucursal de atención</label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs font-medium text-white outline-none focus:border-brand-500 cursor-pointer"
          >
            {BRANCHES.map((b) => <option key={b} className="bg-ink-900">{b}</option>)}
          </select>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
            Selecciona fecha — <span className="capitalize text-brand-300">{monthName}</span>
          </p>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-white/40">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {cells.map((c, i) => (
              <button
                key={i}
                disabled={!c || c < today}
                onClick={() => c && setDay(c)}
                className={`aspect-square rounded-xl text-xs font-semibold transition-all ${
                  !c
                    ? "invisible"
                    : c < today
                      ? "cursor-not-allowed text-white/20 bg-transparent"
                      : day === c
                        ? "bg-brand-500 text-white shadow-glow"
                        : "bg-white/[0.05] text-white/70 hover:bg-white/15 hover:text-white"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Selecciona horario</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {TIMES.map((t) => (
              <button
                key={t}
                onClick={() => setTime(t)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  time === t
                    ? "bg-brand-500 text-white shadow-glow"
                    : "border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {t} hrs
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-white/70">Tu nombre completo *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Matías González"
              required
              className="mt-1.5 w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs text-white outline-none focus:border-brand-500 placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-white/70">Teléfono / WhatsApp *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+56 9 1234 5678"
              required
              className="mt-1.5 w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs text-white outline-none focus:border-brand-500 placeholder-white/40"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-white/70">Correo electrónico *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            required
            className="mt-1.5 w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-xs text-white outline-none focus:border-brand-500 placeholder-white/40"
          />
          <p className="mt-1.5 text-[10px] text-white/40">
            Te enviamos la confirmación con fecha, hora y vehículo.
          </p>
        </div>

        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="apple-btn-primary w-full rounded-full py-3.5 text-xs font-semibold text-white shadow-glow disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting
            ? "Agendando tu prueba…"
            : canConfirm
            ? "Confirmar prueba de manejo"
            : "Completá fecha, hora, contacto y correo"}
        </button>
      </div>
    </div>
  );
}
