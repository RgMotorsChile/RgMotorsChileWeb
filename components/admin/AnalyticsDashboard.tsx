"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCLP, type Vehicle } from "@/lib/vehicles";
import {
  buildLeadsFromCrm,
  computeKpis,
  funnel,
  segments,
  topLeads,
  demandVsStock,
  financing,
  channels,
  salesTrend,
  recommendations,
  topSellingModelsAndProcurement,
  brandMarketShare,
  unmetDemandZeroStock,
  UnmetDemandVehicle,
  scoreBand,
  formatCLPShort,
  type CrmLeadInput,
} from "@/lib/analytics";
import { HBarChart, Donut, LineForecast, Funnel, Gauge, KpiCard } from "./charts";
import { ChannelBadge } from "./AdminSections";

type CapturedLead = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  budget?: number;
  bodyType?: string;
  financing?: boolean;
  intents?: string[];
  models?: string[];
  name?: string;
  contact?: string;
  messages?: number;
  trafficSource?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
};

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [captured, setCaptured] = useState<CapturedLead[]>([]);
  const [crmInputs, setCrmInputs] = useState<CrmLeadInput[]>([]);
  const [liveVehicles, setLiveVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [trackRes, contactRes, tdRes, resRes, creditRes, simRes, vehRes] =
          await Promise.all([
            fetch("/api/track"),
            fetch("/api/contact"),
            fetch("/api/test-drives"),
            fetch("/api/reservations"),
            fetch("/api/credits"),
            fetch("/api/simulations"),
            fetch("/api/vehicles?admin=true"),
          ]);

        const trackJson = trackRes.ok ? await trackRes.json() : { leads: [] };
        const contactJson = contactRes.ok ? await contactRes.json() : { messages: [] };
        const tdJson = tdRes.ok ? await tdRes.json() : { testDrives: [] };
        const resJson = resRes.ok ? await resRes.json() : { reservations: [] };
        const creditJson = creditRes.ok ? await creditRes.json() : { applications: [] };
        const simJson = simRes.ok ? await simRes.json() : { simulations: [] };
        const vehJson = vehRes.ok ? await vehRes.json() : { vehicles: [] };

        const chatLeads: CapturedLead[] = trackJson.leads ?? [];
        const inputs: CrmLeadInput[] = [
          ...chatLeads.map((l) => ({
            id: l.id,
            name: l.name,
            contact: l.contact,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
            budget: l.budget,
            bodyType: l.bodyType,
            financing: l.financing,
            models: l.models,
            messages: l.messages,
            trafficSource: l.trafficSource,
            kind: "chat" as const,
          })),
          ...(contactJson.messages ?? []).map((m: {
            id: string;
            name?: string;
            phone?: string;
            email?: string;
            createdAt?: string;
            trafficSource?: { source?: string };
          }) => ({
            id: m.id,
            name: m.name,
            phone: m.phone,
            email: m.email,
            createdAt: m.createdAt,
            trafficSource: m.trafficSource,
            kind: "contact" as const,
          })),
          ...(tdJson.testDrives ?? []).map((t: {
            id: string;
            clientName?: string;
            clientPhone?: string;
            clientEmail?: string;
            createdAt?: string;
            trafficSource?: { source?: string };
            vehicleTitle?: string;
          }) => ({
            id: t.id,
            name: t.clientName,
            phone: t.clientPhone,
            email: t.clientEmail,
            createdAt: t.createdAt,
            models: t.vehicleTitle ? [t.vehicleTitle] : [],
            trafficSource: t.trafficSource,
            kind: "test-drive" as const,
          })),
          ...(resJson.reservations ?? []).map((r: {
            id: string;
            clientName?: string;
            phone?: string;
            email?: string;
            date?: string;
            amount?: number;
            trafficSource?: { source?: string };
            vehicleSlug?: string;
          }) => ({
            id: r.id,
            name: r.clientName,
            phone: r.phone,
            email: r.email,
            createdAt: r.date,
            budget: r.amount,
            models: r.vehicleSlug ? [r.vehicleSlug] : [],
            trafficSource: r.trafficSource,
            kind: "reservation" as const,
          })),
          ...(creditJson.applications ?? creditJson.credits ?? []).map((c: {
            id: string;
            clientName?: string;
            phone?: string;
            email?: string;
            date?: string;
            trafficSource?: { source?: string };
          }) => ({
            id: c.id,
            name: c.clientName,
            phone: c.phone,
            email: c.email,
            createdAt: c.date,
            financing: true,
            trafficSource: c.trafficSource,
            kind: "credit" as const,
          })),
          ...(simJson.simulations ?? [])
            .filter((e: { eventType?: string }) => e.eventType === "lead_submit")
            .map((e: {
              id: string;
              clientName?: string;
              phone?: string;
              email?: string;
              createdAt?: string;
              vehiclePrice?: number;
              trafficSource?: { source?: string };
              vehicleSlug?: string;
            }) => ({
              id: e.id,
              name: e.clientName,
              phone: e.phone,
              email: e.email,
              createdAt: e.createdAt,
              budget: e.vehiclePrice,
              models: e.vehicleSlug ? [e.vehicleSlug] : [],
              trafficSource: e.trafficSource,
              kind: "simulation" as const,
            })),
        ];

        if (!cancelled) {
          setCaptured(chatLeads);
          setCrmInputs(inputs);
          setLiveVehicles(vehJson.vehicles ?? []);
        }
      } catch {
        if (!cancelled) {
          setCaptured([]);
          setCrmInputs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const leads = useMemo(() => buildLeadsFromCrm(crmInputs), [crmInputs]);
  const kpis = useMemo(() => computeKpis(leads), [leads]);
  const fun = useMemo(() => funnel(leads), [leads]);
  const segs = useMemo(() => segments(leads), [leads]);
  const tops = useMemo(() => topLeads(leads, 10), [leads]);
  const dvs = useMemo(() => demandVsStock(leads), [leads]);
  const fin = useMemo(() => financing(leads), [leads]);
  const chs = useMemo(() => channels(leads), [leads]);
  const trend = useMemo(() => salesTrend(leads), [leads]);
  const recs = useMemo(() => recommendations(leads), [leads]);
  const procurement = useMemo(
    () => topSellingModelsAndProcurement(leads, liveVehicles),
    [leads, liveVehicles],
  );
  const brandsShare = useMemo(() => brandMarketShare(leads), [leads]);
  const missingDemand = useMemo(
    () => unmetDemandZeroStock(liveVehicles),
    [liveVehicles],
  );

  const [analyticsTab, setAnalyticsTab] = useState<"rendimiento" | "compras" | "canales">("rendimiento");
  const [procurementView, setProcurementView] = useState<"zero_stock" | "bestsellers">("zero_stock");
  const [procurementFilter, setProcurementFilter] = useState<string>("all");
  const [procurementCategory, setProcurementCategory] = useState<string>("all");
  const [selectedWaitlist, setSelectedWaitlist] = useState<UnmetDemandVehicle | null>(null);

  const filteredProcurement = useMemo(() => {
    return procurement.filter((p) => {
      const matchCat = procurementCategory === "all" || p.bodyType === procurementCategory;
      const matchFilter =
        procurementFilter === "all" ||
        (procurementFilter === "urgent" && p.recommendation === "Comprar Urgente") ||
        (procurementFilter === "high" && p.recommendation === "Alta Rotación") ||
        (procurementFilter === "optimal" && p.recommendation === "Stock Óptimo") ||
        (procurementFilter === "pause" && p.recommendation === "Pausar Compras");
      return matchCat && matchFilter;
    });
  }, [procurement, procurementCategory, procurementFilter]);

  const filteredMissingDemand = useMemo(() => {
    return missingDemand.filter((m) => {
      const matchCat = procurementCategory === "all" || m.bodyType === procurementCategory;
      return matchCat;
    });
  }, [missingDemand, procurementCategory]);

  const waitlistTotal = filteredMissingDemand.reduce((a, m) => a + m.waitlistBuyers, 0);

  return (
    <div className="space-y-6">
      {loading ? (
        <p className="text-xs text-white/40">Cargando datos reales del CRM…</p>
      ) : null}
      {!loading && leads.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-ink-800/50 px-4 py-3 text-sm text-white/60">
          Todavía no hay leads reales suficientes. Los gráficos se irán llenando con contactos,
          chat, reservas, créditos y test drives del sitio.
        </div>
      ) : null}

      {/* Sub-navegación de Analítica */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink-900/80 p-2 backdrop-blur-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setAnalyticsTab("rendimiento")}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition ${
              analyticsTab === "rendimiento"
                ? "bg-brand-500 text-white shadow-glow"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>📈</span> Rendimiento & Ventas
          </button>
          <button
            onClick={() => setAnalyticsTab("compras")}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition ${
              analyticsTab === "compras"
                ? "bg-brand-500 text-white shadow-glow"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>🛒</span> Compra Inteligente & Stock
            {filteredMissingDemand.length > 0 ? (
              <span className="rounded-full bg-red-500/30 border border-red-500/40 text-red-200 px-2 py-0.5 text-[10px]">
                Sin Stock
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setAnalyticsTab("canales")}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition ${
              analyticsTab === "canales"
                ? "bg-brand-500 text-white shadow-glow"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>🌐</span> Canales & Atribución
          </button>
        </div>
        <p className="text-xs text-white/40 px-3 hidden lg:block">
          Solo datos reales del CRM · sin demos
        </p>
      </div>

      {/* KPIs Globales */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon="👥"
          value={kpis.totalLeads.toLocaleString("es-CL")}
          label="Leads totales"
          trend={kpis.momLeadGrowth ? `${kpis.momLeadGrowth > 0 ? "+" : ""}${kpis.momLeadGrowth}% MoM` : "Datos reales"}
        />
        <KpiCard icon="🔥" value={String(kpis.hotLeads)} label="Leads calientes por contactar" accent="#F97316" />
        <KpiCard icon="🎯" value={`${kpis.conversion}%`} label="Conversión a venta" accent="#22C55E" />
        <KpiCard icon="💰" value={formatCLPShort(kpis.revenue)} label="Ingresos atribuidos" accent="#7C3AED" />
      </div>

      {/* PESTAÑA 1: RENDIMIENTO COMERCIAL & VENTAS */}
      {analyticsTab === "rendimiento" && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon="📅" value={String(kpis.leads30d)} label="Leads últimos 30 días" />
            <KpiCard icon="🏷️" value={formatCLPShort(kpis.avgTicket)} label="Ticket promedio" accent="#2DD4BF" />
            <KpiCard icon="💳" value={`${kpis.creditRate}%`} label="Simula crédito" accent="#FACC15" />
            <KpiCard icon="⭐" value={String(kpis.avgScore)} label="Score promedio de lead" accent="#49A7FF" />
          </div>

          {/* Tendencia + Segmentos */}
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card title="Ventas e ingresos — tendencia y proyección" hint="* meses proyectados con regresión lineal">
              <LineForecast months={trend.months} forecast={trend.forecast} />
              <div className="mt-2 flex gap-4 text-xs text-white/50">
                <span><span className="mr-1 inline-block h-2 w-4 rounded bg-brand-500 align-middle" />Histórico</span>
                <span><span className="mr-1 inline-block h-2 w-4 rounded align-middle" style={{ background: "#49A7FF" }} />Proyección</span>
              </div>
            </Card>
            <Card title="Segmentos de clientes (RFM)">
              <Donut data={segs.map((s) => ({ name: s.name, count: s.count, color: s.color }))} />
            </Card>
          </div>

          {/* Embudo + Financiamiento */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Embudo de conversión">
              <Funnel stages={fun} />
            </Card>
            <Card title="Apetito de financiamiento">
              <div className="flex items-center justify-around">
                <Gauge value={fin.wantsPct} label="Pide crédito" suffix="%" color="#FACC15" />
                <Gauge value={fin.approvalRate} label="Aprobación est." suffix="%" color="#22C55E" />
              </div>
              <div className="mt-3">
                <HBarChart data={fin.terms.map((t) => ({ label: t.label, value: t.pct }))} unit="%" color="#2D8CFF" />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: COMPRA INTELIGENTE & DEMANDA */}
      {analyticsTab === "compras" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Demanda vs. stock por tipo de carrocería" hint="ratio alto = oportunidad de reponer">
              <HBarChart
                data={dvs.map((d) => ({
                  label: `${d.body}`,
                  value: d.demand,
                  sub: `stock ${d.stock} · ratio ${d.ratio}`,
                  color: d.status === "alta" ? "#F97316" : d.status === "media" ? "#FACC15" : "#006CFF",
                }))}
              />
            </Card>
            <Card title="Recomendaciones accionables de compra">
              <ul className="space-y-2.5">
                {recs.map((r, i) => (
                  <li
                    key={i}
                    className={`flex gap-3 rounded-xl border px-3 py-2.5 ${
                      r.tone === "opp"
                        ? "border-brand-500/30 bg-brand-500/5"
                        : r.tone === "warn"
                          ? "border-amber-400/30 bg-amber-400/5"
                          : "border-emerald-400/30 bg-emerald-400/5"
                    }`}
                  >
                    <span className="text-lg">{r.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{r.title}</p>
                      <p className="text-xs text-white/60">{r.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

      {/* MÓDULO ESTRATÉGICO: COMPRA INTELIGENTE DE INVENTARIO & RADAR DE DEMANDA */}
      <div className="space-y-4 rounded-3xl border border-brand-500/30 bg-ink-900/90 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500/20 text-sm">
                🛒
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Módulo de Compra Inteligente & Asistente de Adquisiciones
              </h2>
              <span className="rounded-full bg-brand-500/20 px-2.5 py-0.5 text-[10px] font-bold text-brand-300 border border-brand-500/30">
                EXCLUSIVO DIRECCIÓN
              </span>
            </div>
            <p className="text-xs text-white/60 mt-1">
              Inteligencia de compra predictiva: detecta qué autos comprar en retomas o subastas porque ya tienen clientes listos esperando.
            </p>
          </div>

          {/* Mini KPIs de compra (solo reales) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-center">
              <p className="text-[10px] text-red-300/80">Sin stock (señales)</p>
              <p className="text-xs font-bold text-red-400">
                {filteredMissingDemand.length} modelos
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-center">
              <p className="text-[10px] text-amber-300/80">En lista de espera</p>
              <p className="text-xs font-bold text-amber-400">{waitlistTotal} clientes</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-center">
              <p className="text-[10px] text-white/50">Leads CRM</p>
              <p className="text-xs font-bold text-white">{leads.length}</p>
            </div>
          </div>
        </div>

        {/* Selector de Pestaña Principal (Sin Stock vs Ranking Más Vendidos) */}
        <div className="flex flex-wrap items-center gap-2 border-y border-white/10 py-3">
          <button
            onClick={() => setProcurementView("zero_stock")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-sm ${
              procurementView === "zero_stock"
                ? "bg-red-500 text-white shadow-red-500/20"
                : "bg-ink-800 text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>🚨</span> Autos más buscados sin stock
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
              {waitlistTotal} en espera
            </span>
          </button>

          <button
            onClick={() => setProcurementView("bestsellers")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-sm ${
              procurementView === "bestsellers"
                ? "bg-brand-500 text-white shadow-brand-500/20"
                : "bg-ink-800 text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>🏆</span> Ranking de Modelos Más Vendidos (Histórico)
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
              Top 10 rotación
            </span>
          </button>
        </div>

        {/* Filtros de Categoría */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-white/50 mr-1">Carrocería:</span>
            {["all", "SUV", "Camioneta", "Hatchback", "Sedán"].map((cat) => (
              <button
                key={cat}
                onClick={() => setProcurementCategory(cat)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  procurementCategory === cat
                    ? "bg-brand-500 text-white shadow-sm"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {cat === "all" ? "Todas" : cat}
              </button>
            ))}
          </div>

          {procurementView === "bestsellers" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-white/50 mr-1">Semáforo:</span>
              {[
                { id: "all", label: "Todos" },
                { id: "urgent", label: "🔥 Comprar Urgente" },
                { id: "high", label: "⚡ Alta Rotación" },
                { id: "optimal", label: "✅ Stock Óptimo" },
                { id: "pause", label: "⏸️ Pausar" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setProcurementFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    procurementFilter === f.id
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* VISTA 1: AUTOS MÁS BUSCADOS SIN STOCK (VENTA INMEDIATA) */}
        {procurementView === "zero_stock" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
              Señales de demanda sin stock a partir de leads y pedidos reales. Si aún no hay
              datos, la tabla queda vacía (sin números inventados).
            </div>

            {filteredMissingDemand.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/40">
                Sin señales de demanda sin stock por ahora. Se llenará con pedidos a medida y
                leads reales.
              </p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="text-left text-white/40 border-b border-white/10">
                  <tr>
                    <th className="pb-2.5 font-medium">Modelo Buscado & Rango</th>
                    <th className="pb-2.5 font-medium">Compradores en Espera</th>
                    <th className="pb-2.5 font-medium">Búsquedas sin Stock (30d)</th>
                    <th className="pb-2.5 font-medium">Presupuesto Prom.</th>
                    <th className="pb-2.5 font-medium">Precio Máx. Compra</th>
                    <th className="pb-2.5 font-medium">Tiempo de Venta</th>
                    <th className="pb-2.5 font-medium">Urgencia</th>
                    <th className="pb-2.5 font-medium text-right">Compradores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredMissingDemand.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3">
                        <p className="font-bold text-white flex items-center gap-1.5">
                          {item.brand} {item.model}
                          <span className="rounded bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                            0 en stock
                          </span>
                        </p>
                        <p className="text-[11px] text-white/50">{item.yearRange} · {item.bodyType}</p>
                      </td>
                      <td className="py-3">
                        <span className="font-bold text-amber-400">🔥 {item.waitlistBuyers} clientes</span>
                        <p className="text-[10px] text-white/40">con pre-aprobación</p>
                      </td>
                      <td className="py-3">
                        <span className="font-semibold text-white">{item.searchVolume30d}</span>
                        <span className="text-xs text-white/40 ml-1">consultas web</span>
                      </td>
                      <td className="py-3 font-bold text-white/90">
                        {formatCLP(item.avgBudget)}
                      </td>
                      <td className="py-3 text-xs">
                        <p className="text-emerald-400 font-bold">{formatCLP(item.targetAcquisitionPrice)}</p>
                        <p className="text-emerald-300/60 font-semibold">Margen: +{formatCLPShort(item.estGrossProfit)}</p>
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-300">
                          ⚡ {item.timeToSellHours}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold text-white shadow-sm ${
                          item.urgencyScore >= 90
                            ? "bg-red-500/30 border border-red-500 text-red-200"
                            : "bg-amber-500/30 border border-amber-500 text-amber-200"
                        }`}>
                          {item.urgencyLevel}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => setSelectedWaitlist(item)}
                          className="apple-btn-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-glow hover:scale-105 transition"
                        >
                          <span>👥</span> Ver {item.waitlistBuyers} Compradores
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {/* VISTA 2: RANKING DE MODELOS MÁS VENDIDOS (HISTÓRICO) */}
        {procurementView === "bestsellers" && (
          filteredProcurement.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/40">
              Sin ranking histórico aún. Cuando haya ventas y leads reales, aparecerá aquí.
            </p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-left text-white/40 border-b border-white/10">
                <tr>
                  <th className="pb-2.5 font-medium">Rank & Modelo</th>
                  <th className="pb-2.5 font-medium">Ventas (6m)</th>
                  <th className="pb-2.5 font-medium">Demanda / Espera</th>
                  <th className="pb-2.5 font-medium">Stock Actual</th>
                  <th className="pb-2.5 font-medium">Rotación</th>
                  <th className="pb-2.5 font-medium">Venta / Compra Sugerida</th>
                  <th className="pb-2.5 font-medium">Semáforo de Compra</th>
                  <th className="pb-2.5 font-medium text-right">Margen Bruto Est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredProcurement.map((item) => (
                  <tr key={`${item.brand}-${item.model}`} className="hover:bg-white/[0.02] transition">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                          item.rank <= 3 ? "bg-amber-400 text-ink-950 shadow-sm" : "bg-white/10 text-white/70"
                        }`}>
                          {item.rank}
                        </span>
                        <div>
                          <p className="font-bold text-white flex items-center gap-1.5">
                            {item.brand} {item.model}
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-white/60">
                              {item.bodyType}
                            </span>
                          </p>
                          <p className="text-[11px] text-white/40 max-w-[280px] truncate" title={item.recommendationReason}>
                            {item.recommendationReason}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="font-bold text-white">{item.salesCount}</span>
                      <span className="text-xs text-white/40 ml-1">unidades</span>
                    </td>
                    <td className="py-3">
                      <span className="font-bold text-amber-400">🔥 {item.activeLeads}</span>
                      <span className="text-xs text-white/40 ml-1">en espera</span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.currentStock === 0
                            ? "bg-red-500/20 text-red-300 border border-red-500/30"
                            : item.currentStock <= 2
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {item.currentStock === 0 ? "0 u (Sin stock)" : `${item.currentStock} u`}
                      </span>
                    </td>
                    <td className="py-3">
                      <p className="font-semibold text-white">~{item.avgDaysToSell} días</p>
                      <p className="text-[10px] text-white/40">{item.turnoverSpeed}</p>
                    </td>
                    <td className="py-3 text-xs">
                      <p className="text-white/80 font-medium">Venta: {formatCLP(item.avgRetailPrice)}</p>
                      <p className="text-emerald-400 font-bold">Máx compra: {formatCLP(item.targetBuyPrice)}</p>
                    </td>
                    <td className="py-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold text-white shadow-sm"
                        style={{ background: `${item.badgeColor}33`, borderColor: item.badgeColor, borderWidth: 1 }}
                      >
                        <span>{item.recommendation === "Comprar Urgente" ? "🔥" : item.recommendation === "Alta Rotación" ? "⚡" : item.recommendation === "Stock Óptimo" ? "✅" : "⏸️"}</span>
                        {item.recommendation}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <p className="font-bold text-emerald-400">+{formatCLPShort(item.estGrossMargin)}</p>
                      <p className="text-[10px] text-white/50">{item.estMarginPct}% margen</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        )}

        {/* Gráfico de Market Share por Marca & Reglas de Oro */}
        <div className="grid gap-4 lg:grid-cols-2 pt-2 border-t border-white/10">
          {/* Distribución por marca */}
          <div className="rounded-2xl border border-white/10 bg-ink-950/60 p-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 mb-3">
              <span>📊</span> Participación de Ventas por Marca (% Market Share)
            </h3>
            <div className="space-y-2">
              {brandsShare.length === 0 ? (
                <p className="text-xs text-white/40 py-4">Sin participación de marca aún (datos reales).</p>
              ) : (
              brandsShare.map((b) => (
                <div key={b.brand}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: b.color }} />
                      {b.brand}
                    </span>
                    <span className="text-white/60">
                      {b.salesCount} ventas ({b.sharePct}%) · Ticket prom. {formatCLPShort(b.avgTicket)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${b.sharePct * 2.5}%`, background: b.color }}
                    />
                  </div>
                </div>
              ))
              )}
            </div>
          </div>

          {/* Reglas de Oro de Compra Inteligente */}
          <div className="rounded-2xl border border-white/10 bg-ink-950/60 p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5 mb-2.5">
                <span>💡</span> Reglas de Oro para Compra Inteligente (RG Motors)
              </h3>
              <ul className="space-y-2 text-xs text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">1.</span>
                  <span><strong>Compra contra Demanda Previa:</strong> Prioriza retomas y compras de <em>Mitsubishi L200, Subaru Forester y Suzuki Jimny</em>. Tienen más de 10 clientes listos para comprar en menos de 48 horas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">2.</span>
                  <span><strong>Tope Máximo de Compra (82%):</strong> Compra a un máximo del 82% del valor de mercado para garantizar un margen bruto mínimo de $2.5M - $3.8M por unidad.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-300 font-bold">3.</span>
                  <span><strong>Velocidad antes que Margen Marginal:</strong> Un auto que rota en 24-48 horas permite reinvertir el capital de inmediato sin pagar costo financiero de piso.</span>
                </li>
              </ul>
            </div>

            <div className="mt-3 rounded-xl border border-brand-500/20 bg-brand-500/10 p-2.5 text-[11px] text-brand-300 flex items-center justify-between">
              <span>¿Tienes una tasación pendiente en el módulo de Retomas?</span>
              <a href="#tasaciones" className="font-bold underline hover:text-white">Ver Tasaciones ➔</a>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL / DRAWER DE COMPRADORES EN LISTA DE ESPERA */}
      {selectedWaitlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-2xl rounded-3xl border border-brand-500/30 bg-ink-900 p-6 shadow-2xl">
            <button
              onClick={() => setSelectedWaitlist(null)}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/20 text-xl">
                🔥
              </span>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Compradores en Lista de Espera: {selectedWaitlist.brand} {selectedWaitlist.model}
                </h3>
                <p className="text-xs text-white/60">
                  {selectedWaitlist.waitlistBuyers} clientes esperando este modelo · Presupuesto prom: {formatCLP(selectedWaitlist.avgBudget)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                💰 <strong>Precio máximo recomendado de compra / retoma:</strong> {formatCLP(selectedWaitlist.targetAcquisitionPrice)} (Margen estimado: +{formatCLPShort(selectedWaitlist.estGrossProfit)})
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-ink-950/60 p-2">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/10 text-left text-white/40">
                    <tr>
                      <th className="p-2 font-medium">Cliente</th>
                      <th className="p-2 font-medium">Estado / Forma de Pago</th>
                      <th className="p-2 font-medium">Presupuesto</th>
                      <th className="p-2 font-medium text-right">Contacto WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {selectedWaitlist.buyerProfiles.map((buyer, idx) => {
                      const cleanPhone = buyer.phone.replace(/[^0-9]/g, "");
                      const waMsg = `Hola ${buyer.name}, te contactamos de RG Motors. Nos acaba de ingresar una oportunidad de ${selectedWaitlist.brand} ${selectedWaitlist.model} (${selectedWaitlist.yearRange}) que coincide con tu presupuesto de ${formatCLP(buyer.budget)}. ¿Te gustaría que te reservemos prioridad para verlo antes de publicarlo en la web?`;
                      const waUrl = `https://wa.me/${cleanPhone.startsWith("56") ? cleanPhone : `56${cleanPhone}`}?text=${encodeURIComponent(waMsg)}`;

                      return (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="p-2 font-semibold text-white">
                            {buyer.name}
                            <p className="text-[10px] text-white/40 font-normal">{buyer.phone}</p>
                          </td>
                          <td className="p-2">
                            <span className="rounded-full bg-amber-400/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              {buyer.status}
                            </span>
                          </td>
                          <td className="p-2 font-bold text-brand-300">
                            {formatCLP(buyer.budget)}
                          </td>
                          <td className="p-2 text-right">
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-xl bg-[#25D366]/20 border border-[#25D366]/40 px-2.5 py-1 text-[11px] font-bold text-[#25D366] hover:bg-[#25D366] hover:text-white transition"
                            >
                              <span>💬</span> Pre-vender
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                onClick={() => setSelectedWaitlist(null)}
                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}

      {/* PESTAÑA 3: CANALES & ATRIBUCIÓN */}
      {analyticsTab === "canales" && (
        <div className="space-y-6">
          {/* Canales + Recomendaciones */}
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card title="Atribución por canal">
              <HBarChart
                data={chs.map((c) => ({
                  label: c.name,
                  value: c.leads,
                  sub: `conv. ${c.conversion}%`,
                }))}
              />
            </Card>
            <Card title="Recomendaciones accionables">
              <ul className="space-y-2.5">
                {recs.map((r, i) => (
                  <li
                    key={i}
                    className={`flex gap-3 rounded-xl border px-3 py-2.5 ${
                      r.tone === "opp"
                        ? "border-brand-500/30 bg-brand-500/5"
                        : r.tone === "warn"
                          ? "border-amber-400/30 bg-amber-400/5"
                          : "border-emerald-400/30 bg-emerald-400/5"
                    }`}
                  >
                    <span className="text-lg">{r.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{r.title}</p>
                      <p className="text-xs text-white/60">{r.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

      {/* Clientes potenciales */}
      <Card title="Clientes potenciales priorizados" hint="ordenados por score de intención de compra">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-white/40">
              <tr className="border-b border-white/10">
                <th className="pb-2 font-medium">Cliente</th>
                <th className="pb-2 font-medium">Contacto</th>
                <th className="pb-2 font-medium">Segmento</th>
                <th className="pb-2 font-medium">Interés</th>
                <th className="pb-2 font-medium">Presupuesto</th>
                <th className="pb-2 font-medium">Señales</th>
                <th className="pb-2 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {tops.map((l) => {
                const band = scoreBand(l.score);
                return (
                  <tr key={l.id} className="border-b border-white/5">
                    <td className="py-2.5">
                      <p className="font-medium text-white">{l.name}</p>
                      <p className="text-xs text-white/40">{l.region} · {l.ageBand}</p>
                    </td>
                    <td className="py-2.5 text-white/60">{l.phone}</td>
                    <td className="py-2.5">
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-white/70">{l.segment}</span>
                    </td>
                    <td className="py-2.5 text-white/70">{l.interestBrand} · {l.interestBody}</td>
                    <td className="py-2.5 text-white/70">{formatCLP(l.budget)}</td>
                    <td className="py-2.5 text-xs text-white/50">{l.reason}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          band === "hot"
                            ? "bg-orange-500/15 text-orange-300"
                            : band === "warm"
                              ? "bg-amber-400/15 text-amber-300"
                              : "bg-white/10 text-white/50"
                        }`}
                      >
                        {band === "hot" ? "🔥" : band === "warm" ? "🌡️" : "❄️"} {l.score}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Leads capturados por el ejecutivo virtual (en vivo) */}
      <Card
        title="Leads del ejecutivo virtual (en vivo)"
        hint="datos inferidos de la conversación, sin fricción para el cliente"
      >
        {captured.length === 0 ? (
          <p className="text-sm text-white/40">
            Aún no hay leads. Abre el ejecutivo virtual del sitio, pide opciones
            (marca, tipo o presupuesto) y aparecerán aquí automáticamente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-white/40">
                <tr className="border-b border-white/10">
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium">Interés</th>
                  <th className="pb-2 font-medium">Presupuesto</th>
                  <th className="pb-2 font-medium">Financiamiento</th>
                  <th className="pb-2 font-medium">Canal de Origen</th>
                  <th className="pb-2 font-medium">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {captured.slice(0, 20).map((c) => {
                  const source =
                    c.trafficSource?.source ||
                    (c.intents?.find((i) => i.startsWith("canal-"))?.replace("canal-", "")) ||
                    "Directo";

                  return (
                    <tr key={c.id} className="border-b border-white/5">
                      <td className="py-2.5 text-white/50">
                        {new Date(c.createdAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="py-2.5 text-white/70">{c.bodyType ?? "—"}</td>
                      <td className="py-2.5 text-white/70">{c.budget ? formatCLP(c.budget) : "—"}</td>
                      <td className="py-2.5">
                        {c.financing ? (
                          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">Sí</span>
                        ) : (
                          <span className="text-white/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <ChannelBadge source={source} />
                      </td>
                      <td className="py-2.5 text-white/70">{c.contact ?? <span className="text-white/30">anónimo</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-800/60 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {hint && <span className="text-xs text-white/35">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
