"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCLP } from "@/lib/vehicles";
import { HBarChart } from "./charts";
import type { TelemetryReport } from "@/lib/server/telemetryService";

function fmtNum(n: number): string {
  return n.toLocaleString("es-CL");
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusTheme(level: TelemetryReport["status"]["level"]) {
  switch (level) {
    case "critical":
      return {
        ring: "from-red-500/40 via-red-500/10 to-transparent",
        badge: "bg-red-500/20 text-red-200 border-red-400/30",
        dot: "bg-red-400",
        label: "Crítico",
      };
    case "attention":
      return {
        ring: "from-amber-500/40 via-amber-500/10 to-transparent",
        badge: "bg-amber-500/20 text-amber-100 border-amber-400/30",
        dot: "bg-amber-400",
        label: "Atención",
      };
    case "good":
      return {
        ring: "from-brand-400/40 via-brand-500/10 to-transparent",
        badge: "bg-brand-500/20 text-brand-100 border-brand-400/30",
        dot: "bg-brand-400",
        label: "Activo",
      };
    default:
      return {
        ring: "from-emerald-400/40 via-emerald-500/10 to-transparent",
        badge: "bg-emerald-500/20 text-emerald-100 border-emerald-400/30",
        dot: "bg-emerald-400",
        label: "Excelente",
      };
  }
}

function VisitSparkline({
  days,
}: {
  days: { date: string; views: number }[];
}) {
  const max = Math.max(...days.map((d) => d.views), 1);
  const w = 560;
  const h = 120;
  const pad = 8;
  const pts = days.map((d, i) => {
    const x = pad + (i / Math.max(days.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - (d.views / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");
  const area = `${line} L${w - pad},${h - pad} L${pad},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Visitas últimos 30 días">
      <defs>
        <linearGradient id="teleVisits" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2D8CFF" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#2D8CFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#teleVisits)" />
      <path d={line} fill="none" stroke="#49A7FF" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function MetricTile({
  label,
  value,
  hint,
  accent = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "brand" | "emerald" | "amber" | "violet";
}) {
  const accents = {
    brand: "border-brand-500/25 bg-gradient-to-br from-brand-500/15 to-ink-900/40",
    emerald: "border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-ink-900/40",
    amber: "border-amber-500/25 bg-gradient-to-br from-amber-500/15 to-ink-900/40",
    violet: "border-violet-500/25 bg-gradient-to-br from-violet-500/15 to-ink-900/40",
  };
  return (
    <div className={`rounded-2xl border p-4 ${accents[accent]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
        {label}
      </p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/50">{hint}</p> : null}
    </div>
  );
}

function SignalRow({
  label,
  today,
  month,
  year,
  help,
}: {
  label: string;
  today: number;
  month: number;
  year: number;
  help: string;
}) {
  return (
    <div className="grid grid-cols-[1.4fr_repeat(3,0.7fr)] items-center gap-2 border-b border-white/5 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-[11px] text-white/40">{help}</p>
      </div>
      <p className="text-center text-sm font-semibold text-white">{fmtNum(today)}</p>
      <p className="text-center text-sm font-semibold text-brand-200">{fmtNum(month)}</p>
      <p className="text-center text-sm font-semibold text-white/70">{fmtNum(year)}</p>
    </div>
  );
}

export default function TelemetryDashboard() {
  const [data, setData] = useState<TelemetryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/telemetry")
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "No se pudo cargar la telemetría.");
        }
        return r.json() as Promise<TelemetryReport>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-3xl border border-white/10 bg-ink-900/50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-brand-500/30" />
          <p className="mt-3 text-sm text-white/50">Preparando el pulso del negocio…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
        <p className="font-semibold text-red-200">No pudimos cargar la telemetría</p>
        <p className="mt-1 text-sm text-white/60">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const theme = statusTheme(data.status.level);
  const s = data.business.signals;

  return (
    <div className="space-y-6">
      {/* Hero estado */}
      <section
        className={`relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900/70 p-6 sm:p-8`}
      >
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${theme.ring}`}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${theme.badge}`}
              >
                <span className={`h-2 w-2 rounded-full ${theme.dot} animate-pulse`} />
                {theme.label}
              </span>
              <span className="text-[11px] text-white/40">
                Actualizado {fmtWhen(data.generatedAt)} · entorno {data.health.env}
              </span>
            </div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {data.status.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-base">
              {data.status.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
          >
            Actualizar ahora
          </button>
        </div>
      </section>

      {/* Visitas */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white">Tráfico del sitio</h3>
          <p className="text-xs text-white/45">
            Visitas de personas que aceptaron cookies. Día / mes / año en horario Chile.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Hoy"
            value={fmtNum(data.visits.today.views)}
            hint={`${fmtNum(data.visits.today.uniques)} visitantes únicos`}
            accent="brand"
          />
          <MetricTile
            label="Este mes"
            value={fmtNum(data.visits.month.views)}
            hint={`${fmtNum(data.visits.month.uniques)} visitantes únicos`}
            accent="violet"
          />
          <MetricTile
            label="Este año"
            value={fmtNum(data.visits.year.views)}
            hint={`${fmtNum(data.visits.year.uniques)} visitantes únicos`}
            accent="emerald"
          />
        </div>
        <div className="rounded-3xl border border-white/10 bg-ink-800/50 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Últimos 30 días</p>
            <p className="text-[11px] text-white/40">
              {data.visits.trackingSince
                ? `Medición desde ${data.visits.trackingSince}`
                : "Aún sin historial — las visitas empiezan a contarse desde ahora"}
            </p>
          </div>
          <VisitSparkline days={data.visits.last30Days} />
          {data.visits.topPaths.length > 0 ? (
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-white/40">
                Páginas más vistas
              </p>
              <HBarChart
                data={data.visits.topPaths.map((p) => ({
                  label: p.path === "/" ? "Inicio" : p.path,
                  value: p.views,
                }))}
                color="#2D8CFF"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* Impacto negocio */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white">Impacto en el negocio</h3>
          <p className="text-xs text-white/45">
            Interés real de clientes: formularios, chat, reservas y pruebas de manejo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Interés hoy"
            value={fmtNum(data.business.interestToday)}
            hint="Contactos + leads + solicitudes"
            accent="amber"
          />
          <MetricTile
            label="Interés este mes"
            value={fmtNum(data.business.interestThisMonth)}
            hint={
              data.business.conversionRateMonthPct > 0
                ? `≈ ${data.business.conversionRateMonthPct}% de visitantes únicos`
                : "Sin ratio aún (faltan visitas o leads)"
            }
            accent="emerald"
          />
          <MetricTile
            label="Pendientes de atender"
            value={fmtNum(
              data.business.pendingReservations + data.business.pendingTestDrives,
            )}
            hint={`${data.business.pendingReservations} reservas · ${data.business.pendingTestDrives} test drives`}
            accent="amber"
          />
          <MetricTile
            label="Ventas registradas"
            value={fmtNum(data.business.soldThisMonth)}
            hint={`${fmtNum(data.business.soldThisYear)} en el año`}
            accent="brand"
          />
        </div>

        <div className="rounded-3xl border border-white/10 bg-ink-800/50 p-5">
          <div className="mb-2 grid grid-cols-[1.4fr_repeat(3,0.7fr)] gap-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
            <span>Qué pasó</span>
            <span className="text-center">Hoy</span>
            <span className="text-center">Mes</span>
            <span className="text-center">Año</span>
          </div>
          <SignalRow
            label="Mensajes de contacto"
            help="Formulario de contacto del sitio"
            today={s.contacts.today}
            month={s.contacts.month}
            year={s.contacts.year}
          />
          <SignalRow
            label="Conversaciones del chat"
            help="Personas que hablaron con el asistente"
            today={s.chatLeads.today}
            month={s.chatLeads.month}
            year={s.chatLeads.year}
          />
          <SignalRow
            label="Pruebas de manejo"
            help="Solicitudes de test drive"
            today={s.testDrives.today}
            month={s.testDrives.month}
            year={s.testDrives.year}
          />
          <SignalRow
            label="Reservas"
            help="Clientes que pidieron reservar un auto"
            today={s.reservations.today}
            month={s.reservations.month}
            year={s.reservations.year}
          />
          <SignalRow
            label="Créditos / preaprobaciones"
            help="Interés en financiamiento"
            today={s.credits.today}
            month={s.credits.month}
            year={s.credits.year}
          />
          <SignalRow
            label="Simulaciones con contacto"
            help="Usaron el simulador y dejaron datos"
            today={s.simulationLeads.today}
            month={s.simulationLeads.month}
            year={s.simulationLeads.year}
          />
          <SignalRow
            label="Tasaciones (trade-in)"
            help="Quieren dejar su auto a cuenta"
            today={s.tradeIns.today}
            month={s.tradeIns.month}
            year={s.tradeIns.year}
          />
          <SignalRow
            label="Pedidos a medida"
            help="Buscan un auto que no está en stock"
            today={s.carRequests.today}
            month={s.carRequests.month}
            year={s.carRequests.year}
          />
          <SignalRow
            label="Alertas de precio"
            help="Avisame si baja el precio"
            today={s.priceAlerts.today}
            month={s.priceAlerts.month}
            year={s.priceAlerts.year}
          />
        </div>

        {data.business.channels.length > 0 ? (
          <div className="rounded-3xl border border-white/10 bg-ink-800/50 p-5">
            <p className="mb-3 text-sm font-semibold text-white">¿De dónde llegan los interesados?</p>
            <HBarChart
              data={data.business.channels.map((c) => ({
                label: c.source,
                value: c.count,
              }))}
              color="#34D399"
            />
          </div>
        ) : null}
      </section>

      {/* Inventario + salud */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-ink-800/50 p-5">
          <h3 className="text-lg font-bold text-white">Salud del inventario</h3>
          <p className="mb-4 text-xs text-white/45">
            Qué tenés publicado hoy y cuánto vale el stock.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-[11px] text-white/40">En catálogo</p>
              <p className="text-2xl font-bold">{fmtNum(data.inventory.total)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-[11px] text-white/40">Disponibles</p>
              <p className="text-2xl font-bold text-emerald-300">
                {fmtNum(data.inventory.available)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-[11px] text-white/40">Borradores</p>
              <p className="text-2xl font-bold text-amber-200">
                {fmtNum(data.inventory.drafts)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-[11px] text-white/40">Vendidos (historial)</p>
              <p className="text-2xl font-bold">{fmtNum(data.inventory.soldTotal)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/70">
            Valorización del catálogo:{" "}
            <span className="font-bold text-white">
              {formatCLP(data.inventory.stockValue)}
            </span>
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-ink-800/50 p-5">
          <h3 className="text-lg font-bold text-white">Salud del proyecto</h3>
          <p className="mb-4 text-xs text-white/45">
            En español simple: qué está bien y qué conviene revisar.
          </p>
          <ul className="space-y-3">
            {data.health.checks.map((c) => (
              <li
                key={c.id}
                className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3"
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    c.ok
                      ? "bg-emerald-500/20 text-emerald-300"
                      : c.severity === "critical"
                        ? "bg-red-500/20 text-red-300"
                        : c.severity === "warn"
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-white/10 text-white/50"
                  }`}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{c.label}</p>
                  <p className="text-xs leading-relaxed text-white/50">{c.plain}</p>
                </div>
              </li>
            ))}
          </ul>
          {data.health.emailPendingCount > 0 ? (
            <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Hay {data.health.emailPendingCount} avisos que no se enviaron por correo
              (quedaron pendientes). Con Resend verificado deberían normalizarse los
              nuevos.
            </p>
          ) : null}
        </section>
      </div>

      {/* Actividad */}
      <section className="rounded-3xl border border-white/10 bg-ink-800/50 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Actividad reciente</h3>
            <p className="text-xs text-white/45">
              Últimos avisos al equipo (leads, reservas, créditos…).
            </p>
          </div>
        </div>
        {data.activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/40">
            Todavía no hay actividad registrada. Cuando alguien deje un lead, aparecerá aquí.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{a.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        a.ok
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {a.ok ? "Aviso OK" : "Email pendiente"}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-white/45">{a.body}</p>
                </div>
                <p className="shrink-0 text-[11px] text-white/35">{fmtWhen(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
