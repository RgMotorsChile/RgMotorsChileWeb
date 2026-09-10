"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import TelemetryDashboard from "@/components/admin/TelemetryDashboard";
import {
  InventoryHubSection,
  CrmHubSection,
  ConfigSection,
} from "@/components/admin/AdminSections";
import { asset } from "@/lib/asset";
import { Vehicle, formatCLP } from "@/lib/vehicles";

type AdminTab =
  | "dashboard"
  | "telemetria"
  | "inventario"
  | "crm"
  | "analitica"
  | "config";

const NAV: { id: AdminTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard Ejecutivo", icon: "▦" },
  { id: "telemetria", label: "Telemetría & Salud", icon: "◎" },
  { id: "inventario", label: "Inventario & Multimedia", icon: "🚘" },
  { id: "crm", label: "CRM Comercial & Leads", icon: "👥" },
  { id: "analitica", label: "Analítica & Reportes", icon: "📊" },
  { id: "config", label: "Configuración", icon: "⚙" },
];

export default function AdminPage() {
  const [active, setActive] = useState<AdminTab>("dashboard");
  const [vehiclesList, setVehiclesList] = useState<Vehicle[]>([]);
  const [reservationsList, setReservationsList] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/vehicles?admin=true")
      .then((r) => (r.ok ? r.json() : { vehicles: [] }))
      .then((data) => {
        setVehiclesList(data.vehicles || []);
      })
      .catch(() => {});

    fetch("/api/reservations")
      .then((r) => (r.ok ? r.json() : { reservations: [] }))
      .then((data) => {
        setReservationsList(data.reservations || []);
      })
      .catch(() => {});
  }, []);

  const totalStockValue = vehiclesList.reduce((acc, v) => acc + (v.price || 0), 0);
  const availableCount = vehiclesList.filter((v) => (v.status || "Disponible") === "Disponible").length;
  const paidReservations = reservationsList.filter((r) => r.status === "Pagada").length;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      // redirect anyway
    }
    window.location.href = "/admin/login";
  };

  return (
    <div className="min-h-screen bg-ink-950 text-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/10 bg-ink-800/40 p-4 lg:flex flex-col justify-between overflow-y-auto">
          <div>
            <Link href="/" className="block px-2 py-2">
              <Logo size={32} tagline={false} />
            </Link>
            <p className="mt-2 px-2 text-[10px] font-bold uppercase tracking-wider text-brand-400">
              Portal Administrador RG
            </p>
            <nav className="mt-4 space-y-1.5">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setActive(n.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                    active === n.id
                      ? "bg-brand-500 text-white shadow-glow"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="w-5 text-center text-sm">{n.icon}</span> {n.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4 mt-4">
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 text-xs text-white/40 hover:text-white transition"
            >
              ← Volver al sitio público
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-400/80 hover:text-red-300 transition"
            >
              ⏻ Cerrar sesión admin
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-y-auto max-w-7xl">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {
                  {
                    dashboard: "Dashboard Ejecutivo",
                    telemetria: "Telemetría & Salud del Negocio",
                    inventario: "Inventario & Multimedia",
                    crm: "Centro Comercial & Oportunidades (CRM)",
                    analitica: "Analítica & Inteligencia de Negocio",
                    config: "Configuración del Negocio",
                  }[active]
                }
              </h1>
              <p className="text-xs text-white/50 mt-0.5">
                {
                  {
                    dashboard: "Resumen gerencial de inventario, prospectos y reservas activas",
                    telemetria:
                      "Visitas, impacto comercial, estado de la base de datos y avisos — en lenguaje claro",
                    inventario: "Administración integral de vehículos, fichas técnicas y fotos",
                    crm: "Gestión unificada de prospectos, pruebas de manejo, reservas y créditos",
                    analitica: "Proyecciones de ventas, radar de compra inteligente y atribución multicanal",
                    config: "Parámetros del negocio, financiamiento, canales de contacto y datos de sucursal",
                  }[active]
                }
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-ink-800 px-3.5 py-1.5 text-xs">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/20 font-bold text-brand-300">
                  A
                </span>
                <span className="text-white/80 font-medium">Administrador RG</span>
              </div>
              <button
                onClick={handleLogout}
                className="lg:hidden rounded-full border border-white/10 px-3 py-1.5 text-xs text-red-400/80"
              >
                Salir
              </button>
            </div>
          </div>

          {/* Mobile Nav Tabs */}
          <div className="mb-6 flex gap-1.5 overflow-x-auto pb-2 lg:hidden">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold ${
                  active === n.id
                    ? "bg-brand-500 text-white shadow-sm"
                    : "bg-ink-800/80 text-white/60 hover:text-white"
                }`}
              >
                <span>{n.icon}</span> {n.label}
              </button>
            ))}
          </div>

          {/* MÓDULO: TELEMETRÍA */}
          {active === "telemetria" && <TelemetryDashboard />}

          {/* MÓDULO 1: DASHBOARD EJECUTIVO */}
          {active === "dashboard" && (
            <div className="space-y-6">
              {/* 4 KPIs de Alto Impacto */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  icon="🚘"
                  value={String(vehiclesList.length)}
                  label="Vehículos en Catálogo"
                  trend={`${availableCount} disponibles`}
                />
                <Kpi
                  icon="★"
                  value={String(reservationsList.length)}
                  label="Solicitudes de reserva"
                  trend={`${paidReservations} pagadas`}
                />
                <Kpi
                  icon="💰"
                  value={totalStockValue ? formatCLP(totalStockValue) : formatCLP(0)}
                  label="Valorización de Catálogo"
                  trend="Inventario activo"
                />
                <Kpi
                  icon="📦"
                  value={String(availableCount)}
                  label="Disponibles"
                  trend={`${vehiclesList.length - availableCount} no disponibles`}
                />
              </div>

              {/* Accesos Directos Rápidos */}
              <div className="rounded-2xl border border-white/10 bg-ink-800/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3">
                  Accesos Rápidos
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    onClick={() => setActive("inventario")}
                    className="flex items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-left transition hover:bg-brand-500/20 hover:border-brand-500/40"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/20 text-lg">
                      🚘
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">Catálogo & Fotos</p>
                      <p className="text-[11px] text-brand-300">Publicar o editar autos</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActive("crm")}
                    className="flex items-center gap-3 rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 text-left transition hover:bg-orange-500/20 hover:border-orange-500/40"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-orange-500/20 text-lg">
                      🔥
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">Centro Comercial</p>
                      <p className="text-[11px] text-orange-300">Leads y Test Drives</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActive("crm")}
                    className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-left transition hover:bg-emerald-500/20 hover:border-emerald-500/40"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/20 text-lg">
                      ★
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">Reservas</p>
                      <p className="text-[11px] text-emerald-300">Solicitudes recibidas</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActive("telemetria")}
                    className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-left transition hover:bg-cyan-500/20 hover:border-cyan-500/40"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-500/20 text-lg">
                      ◎
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">Telemetría & Salud</p>
                      <p className="text-[11px] text-cyan-300">Visitas, leads y sistemas</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2 Widgets de Actividad Reciente */}
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                {/* Reservas Recientes */}
                <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold text-white">Últimas solicitudes de reserva</h2>
                    <button
                      onClick={() => setActive("crm")}
                      className="text-xs text-brand-400 hover:underline"
                    >
                      Ver todas en CRM →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    {reservationsList.length === 0 ? (
                      <p className="text-xs text-white/40 py-4">Sin reservas registradas aún.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="text-left text-white/40 border-b border-white/10">
                          <tr>
                            <th className="pb-2">Cliente</th>
                            <th className="pb-2">Vehículo</th>
                            <th className="pb-2">Monto</th>
                            <th className="pb-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {reservationsList.slice(0, 5).map((r) => (
                            <tr key={r.id} className="hover:bg-white/[0.02]">
                              <td className="py-2.5 font-medium text-white">{r.clientName}</td>
                              <td className="py-2.5 text-white/70">{r.vehicleSlug}</td>
                              <td className="py-2.5 font-bold text-white">{formatCLP(r.amount)}</td>
                              <td className="py-2.5">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    r.status === "Pagada"
                                      ? "bg-emerald-400/15 text-emerald-300"
                                      : r.status === "Pendiente" || r.status === "En proceso"
                                      ? "bg-amber-400/15 text-amber-300"
                                      : "bg-red-400/15 text-red-300"
                                  }`}
                                >
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Vehículos en Inventario */}
                <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold text-white">Inventario Destacado</h2>
                    <button
                      onClick={() => setActive("inventario")}
                      className="text-xs text-brand-400 hover:underline"
                    >
                      Gestionar catálogo →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {vehiclesList.length === 0 ? (
                      <p className="text-xs text-white/40 py-4">Sin vehículos en catálogo.</p>
                    ) : (
                      vehiclesList.slice(0, 4).map((v, i) => (
                        <div key={v.slug} className="flex items-center gap-3">
                          <span className="text-xs font-bold text-white/30">{i + 1}</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset(v.image)}
                            alt={v.model}
                            className="h-10 w-14 rounded-lg object-cover border border-white/10"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-white">
                              {v.brand} {v.model}
                            </p>
                            <p className="text-[11px] text-brand-300 font-medium">{formatCLP(v.price)}</p>
                          </div>
                          <span className="text-xs text-white/50">{v.status || "Disponible"}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MÓDULO 2: INVENTARIO & MULTIMEDIA */}
          {active === "inventario" && <InventoryHubSection />}

          {/* MÓDULO 3: CRM COMERCIAL & LEADS */}
          {active === "crm" && <CrmHubSection />}

          {/* MÓDULO 4: ANALÍTICA & INTELIGENCIA */}
          {active === "analitica" && <AnalyticsDashboard />}

          {/* MÓDULO 5: CONFIGURACIÓN */}
          {active === "config" && <ConfigSection />}
        </main>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  value,
  label,
  trend,
}: {
  icon: string;
  value: string;
  label: string;
  trend: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300 text-lg">
          {icon}
        </span>
        <span className="text-xs text-emerald-400 font-medium">{trend}</span>
      </div>
      <p className="mt-3 text-2xl font-extrabold text-white">{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}

