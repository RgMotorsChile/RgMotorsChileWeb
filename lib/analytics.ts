/**
 * Motor de analítica de RG Motors.
 * Trabaja solo con leads reales entregados por API/caller.
 * No genera datasets sintéticos en producción.
 */
import { vehicles, type Vehicle } from "@/lib/vehicles";

/** Demo/synthetic analytics disabled — use real leads from /api/track etc. */
export function isDemoAnalytics() {
  return false;
}

// Ancla temporal fija (legacy); salesTrend usa Date.now() por defecto.
export const ANCHOR = new Date("2026-07-15T12:00:00Z");
const DAY = 86_400_000;

export type Source =
  | "Orgánico"
  | "Google Ads"
  | "Instagram"
  | "Facebook"
  | "Referido"
  | "Chatbot"
  | "Ejecutivo virtual";

export type BodyType = Vehicle["bodyType"];

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string;
  region: string;
  ageBand: string;
  source: Source;
  createdDaysAgo: number;
  lastActivityDaysAgo: number;
  interestBody: BodyType;
  interestBrand: string;
  budget: number; // CLP
  wantsFinancing: boolean;
  views: number;
  creditSims: number;
  testDrive: boolean;
  reserved: boolean;
  purchased: boolean;
  score: number; // 0-100
  segment: string;
};

// ---- Helpers de fecha / CRM (sin inventar leads) ---------------------------

export function daysAgoFromIso(iso: string | undefined, now = Date.now()): number {
  if (!iso) return 999;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 999;
  return Math.max(0, Math.floor((now - t) / DAY));
}

function normalizeSource(raw?: string): Source {
  const s = (raw || "").toLowerCase();
  if (s.includes("google")) return "Google Ads";
  if (s.includes("instagram") || s.includes("ig")) return "Instagram";
  if (s.includes("facebook") || s.includes("meta") || s.includes("fb")) return "Facebook";
  if (s.includes("refer")) return "Referido";
  if (s.includes("chat") || s.includes("asistente")) return "Chatbot";
  if (s.includes("orgán") || s.includes("organ")) return "Orgánico";
  if (!raw || s.includes("direct")) return "Orgánico";
  return "Orgánico";
}

function normalizeBody(raw?: string): BodyType {
  const t = (raw || "").toLowerCase();
  if (t.includes("camion") || t.includes("pickup")) return "Camioneta";
  if (t.includes("suv")) return "SUV";
  if (t.includes("sed")) return "Sedán";
  if (t.includes("hatch")) return "Hatchback";
  if (t.includes("furg")) return "Furgón";
  return "SUV";
}

export type CrmLeadInput = {
  id: string;
  name?: string;
  contact?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  budget?: number;
  bodyType?: string;
  financing?: boolean;
  models?: string[];
  messages?: number;
  trafficSource?: { source?: string } | null;
  kind?: "chat" | "contact" | "test-drive" | "reservation" | "credit" | "simulation";
};

/** Convierte eventos CRM reales al modelo Lead del dashboard (sin inventar). */
export function mapCrmToLead(input: CrmLeadInput, now = Date.now()): Lead {
  const createdDaysAgo = daysAgoFromIso(input.createdAt || input.updatedAt, now);
  const lastActivityDaysAgo = daysAgoFromIso(input.updatedAt || input.createdAt, now);
  const brandFromModel = (input.models?.[0] || "").trim().split(/\s+/)[0] || "Varias";
  const base: Omit<Lead, "score" | "segment"> = {
    id: input.id,
    name: (input.name || "Prospecto").slice(0, 80),
    phone: (input.phone || input.contact || "").slice(0, 40),
    email: (input.email || "").slice(0, 80),
    region: "Los Lagos",
    ageBand: "—",
    source: normalizeSource(input.trafficSource?.source),
    createdDaysAgo,
    lastActivityDaysAgo,
    interestBody: normalizeBody(input.bodyType),
    interestBrand: brandFromModel,
    budget: Number(input.budget) > 0 ? Number(input.budget) : 12_000_000,
    wantsFinancing:
      Boolean(input.financing) ||
      input.kind === "credit" ||
      input.kind === "simulation",
    views: Math.max(1, Number(input.messages) || 1),
    creditSims: input.kind === "credit" || input.kind === "simulation" ? 1 : 0,
    testDrive: input.kind === "test-drive",
    reserved: input.kind === "reservation",
    purchased: false,
  };
  const score = leadScore(base);
  return { ...base, score, segment: segmentOf(base, score) };
}

export function buildLeadsFromCrm(inputs: CrmLeadInput[], now = Date.now()): Lead[] {
  return inputs.map((i) => mapCrmToLead(i, now));
}

/** @deprecated Preferí buildLeadsFromCrm con datos reales. */
export function generateLeads(): Lead[] {
  return [];
}

// ---- Scoring de leads (0-100) ---------------------------------------------
export function leadScore(l: Omit<Lead, "score" | "segment">): number {
  let s = 0;
  s += Math.min(l.views, 12) * 2.2; // interés / navegación
  s += l.creditSims * 7; // intención de compra financiada
  s += l.testDrive ? 16 : 0; // paso fuerte
  s += l.reserved ? 22 : 0; // muy fuerte
  s += l.purchased ? 10 : 0;
  s += l.wantsFinancing ? 5 : 0;
  // Recencia: actividad reciente pesa más.
  s += l.lastActivityDaysAgo <= 7 ? 12 : l.lastActivityDaysAgo <= 21 ? 6 : 0;
  // Presupuesto alineado con inventario disponible.
  const affordable = vehicles.some(
    (v) => v.bodyType === l.interestBody && v.price <= l.budget
  );
  s += affordable ? 6 : -4;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function scoreBand(score: number): "hot" | "warm" | "cold" {
  return score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
}

// ---- Segmentación (RFM / reglas de negocio) --------------------------------
function segmentOf(l: Omit<Lead, "score" | "segment">, score: number): string {
  if (l.purchased) return "Cliente comprador";
  if (l.budget >= 18_000_000) return "Comprador premium";
  if (l.interestBody === "Camioneta") return "Trabajo / 4x4";
  if (l.wantsFinancing && l.budget < 14_000_000) return "Busca financiamiento";
  if (l.budget < 11_000_000) return "Primer auto";
  if (l.interestBody === "SUV") return "Familiar SUV";
  if (score < 35) return "Indeciso";
  return "Explorador";
}

export const SEGMENT_COLORS: Record<string, string> = {
  "Cliente comprador": "#22C55E",
  "Comprador premium": "#7C3AED",
  "Familiar SUV": "#006CFF",
  "Busca financiamiento": "#FACC15",
  "Trabajo / 4x4": "#F97316",
  "Primer auto": "#2DD4BF",
  Indeciso: "#8A9099",
  Explorador: "#49A7FF",
};

// ---- KPIs -----------------------------------------------------------------
export type Kpis = {
  totalLeads: number;
  leads30d: number;
  hotLeads: number;
  conversion: number; // % leads que compran
  reservationRate: number; // % que reserva
  creditRate: number; // % que simula crédito
  avgTicket: number;
  revenue: number;
  avgScore: number;
  momLeadGrowth: number; // % crecimiento de leads mes vs mes
};

export function computeKpis(leads: Lead[]): Kpis {
  const total = leads.length;
  if (total === 0) {
    return {
      totalLeads: 0,
      leads30d: 0,
      hotLeads: 0,
      conversion: 0,
      reservationRate: 0,
      creditRate: 0,
      avgTicket: 0,
      revenue: 0,
      avgScore: 0,
      momLeadGrowth: 0,
    };
  }
  const purchased = leads.filter((l) => l.purchased);
  const revenue = purchased.reduce((a, l) => a + estClose(l), 0);
  const leads30d = leads.filter((l) => l.createdDaysAgo <= 30).length;
  const leadsPrev30 = leads.filter(
    (l) => l.createdDaysAgo > 30 && l.createdDaysAgo <= 60
  ).length;
  return {
    totalLeads: total,
    leads30d,
    hotLeads: leads.filter((l) => scoreBand(l.score) === "hot").length,
    conversion: pct(purchased.length, total),
    reservationRate: pct(leads.filter((l) => l.reserved).length, total),
    creditRate: pct(leads.filter((l) => l.creditSims > 0).length, total),
    avgTicket: purchased.length ? Math.round(revenue / purchased.length) : 0,
    revenue,
    avgScore: Math.round(leads.reduce((a, l) => a + l.score, 0) / total),
    momLeadGrowth: leadsPrev30 ? Math.round(((leads30d - leadsPrev30) / leadsPrev30) * 100) : 0,
  };
}

/** Precio de cierre estimado según el auto más caro que calza con el lead. */
function estClose(l: Lead): number {
  const match = vehicles
    .filter((v) => v.bodyType === l.interestBody && v.price <= l.budget)
    .sort((a, b) => b.price - a.price)[0];
  return match ? match.price : Math.round(l.budget * 0.85);
}

// ---- Embudo de conversión --------------------------------------------------
export function funnel(leads: Lead[]) {
  const total = leads.length;
  const stages = [
    { label: "Visitaron fichas", value: total },
    { label: "Simularon crédito", value: leads.filter((l) => l.creditSims > 0).length },
    { label: "Agendaron prueba", value: leads.filter((l) => l.testDrive).length },
    { label: "Reservaron", value: leads.filter((l) => l.reserved).length },
    { label: "Compraron", value: leads.filter((l) => l.purchased).length },
  ];
  return stages.map((s, i) => ({
    ...s,
    pct: pct(s.value, total),
    dropFromPrev: i === 0 ? 0 : pct(stages[i].value, stages[i - 1].value),
  }));
}

// ---- Segmentos -------------------------------------------------------------
export function segments(leads: Lead[]) {
  if (!leads.length) return [];
  const map = new Map<string, Lead[]>();
  for (const l of leads) {
    if (!map.has(l.segment)) map.set(l.segment, []);
    map.get(l.segment)!.push(l);
  }
  return [...map.entries()]
    .map(([name, ls]) => ({
      name,
      count: ls.length,
      pct: pct(ls.length, leads.length),
      avgScore: Math.round(ls.reduce((a, l) => a + l.score, 0) / ls.length),
      avgBudget: Math.round(ls.reduce((a, l) => a + l.budget, 0) / ls.length),
      conversion: pct(ls.filter((l) => l.purchased).length, ls.length),
      color: SEGMENT_COLORS[name] ?? "#49A7FF",
    }))
    .sort((a, b) => b.count - a.count);
}

// ---- Clientes potenciales (top leads por score) ----------------------------
export function topLeads(leads: Lead[], n = 10) {
  return [...leads]
    .filter((l) => !l.purchased)
    .sort((a, b) => b.score - a.score || a.lastActivityDaysAgo - b.lastActivityDaysAgo)
    .slice(0, n)
    .map((l) => ({ ...l, reason: reasonFor(l) }));
}

function reasonFor(l: Lead): string {
  const bits: string[] = [];
  if (l.reserved) bits.push("reservó");
  if (l.testDrive) bits.push("agendó prueba");
  if (l.creditSims > 0) bits.push(`${l.creditSims} simulación${l.creditSims > 1 ? "es" : ""} de crédito`);
  if (l.lastActivityDaysAgo <= 7) bits.push("activo esta semana");
  if (bits.length === 0) bits.push(`${l.views} vistas de fichas`);
  return bits.slice(0, 2).join(" · ");
}

// ---- Demanda vs. stock -----------------------------------------------------
export function demandVsStock(leads: Lead[]) {
  const bodies: BodyType[] = ["SUV", "Camioneta", "Sedán", "Hatchback"];
  return bodies.map((body) => {
    const demand = leads.filter((l) => l.interestBody === body).length;
    const stock = vehicles.filter((v) => v.bodyType === body).length;
    const ratio = stock ? demand / stock : demand;
    return {
      body,
      demand,
      demandPct: pct(demand, leads.length),
      stock,
      ratio: Math.round(ratio * 10) / 10,
      status: ratio > 55 ? "alta" : ratio > 35 ? "media" : "ok",
    };
  }).sort((a, b) => b.ratio - a.ratio);
}

// ---- Apetito de financiamiento ---------------------------------------------
export function financing(leads: Lead[]) {
  const wants = leads.filter((l) => l.wantsFinancing);
  return {
    wantsPct: pct(wants.length, leads.length),
    approvalRate: 0, // sin datos reales de aprobación
    avgDown: 20,
    terms: [
      { label: "24 cuotas", pct: 0 },
      { label: "36 cuotas", pct: 0 },
      { label: "48 cuotas", pct: 0 },
      { label: "60 cuotas", pct: 0 },
    ],
  };
}

// ---- Atribución de canal ---------------------------------------------------
export function channels(leads: Lead[]) {
  if (!leads.length) return [];
  const map = new Map<Source, Lead[]>();
  for (const l of leads) {
    if (!map.has(l.source)) map.set(l.source, []);
    map.get(l.source)!.push(l);
  }
  return [...map.entries()]
    .map(([name, ls]) => ({
      name,
      leads: ls.length,
      conversion: pct(ls.filter((l) => l.purchased).length, ls.length),
      revenue: ls.filter((l) => l.purchased).reduce((a, l) => a + estClose(l), 0),
      avgScore: Math.round(ls.reduce((a, l) => a + l.score, 0) / ls.length),
    }))
    .sort((a, b) => b.leads - a.leads);
}

// ---- Tendencia de ventas + proyección (regresión lineal) -------------------
export function salesTrend(leads: Lead[], now = new Date()) {
  const months: { key: string; label: string; leads: number; sales: number; revenue: number }[] = [];
  const MNAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  for (let back = 5; back >= 0; back--) {
    const d = new Date(now.getTime() - back * 30 * DAY);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MNAMES[d.getMonth()], leads: 0, sales: 0, revenue: 0 });
  }
  const idxOf = (daysAgo: number) => 5 - Math.min(5, Math.floor(daysAgo / 30));
  for (const l of leads) {
    const idx = idxOf(l.createdDaysAgo);
    if (idx < 0 || idx > 5) continue;
    months[idx].leads++;
    if (l.purchased) {
      months[idx].sales++;
      months[idx].revenue += estClose(l);
    }
  }
  // Regresión lineal simple sobre ingresos para proyectar 2 meses.
  const ys = months.map((m) => m.revenue);
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  const forecast = [1, 2].map((k) => {
    const d = new Date(ANCHOR.getTime() + k * 30 * DAY);
    return { label: MNAMES[d.getMonth()], revenue: Math.max(0, Math.round(intercept + slope * (n - 1 + k))) };
  });
  return { months, forecast, slope };
}

// ---- Recomendaciones accionables ------------------------------------------
export function recommendations(leads: Lead[]): { icon: string; title: string; detail: string; tone: "opp" | "warn" | "good" }[] {
  if (!leads.length) {
    return [
      {
        icon: "ℹ️",
        title: "Sin leads analíticos aún",
        detail: "Los KPIs se llenarán con datos reales del sitio (chat, formularios, CRM).",
        tone: "good",
      },
    ];
  }
  const recs: { icon: string; title: string; detail: string; tone: "opp" | "warn" | "good" }[] = [];
  const hot = leads.filter((l) => scoreBand(l.score) === "hot" && !l.purchased);
  const hotStale = hot.filter((l) => l.lastActivityDaysAgo > 3);
  if (hot.length) {
    recs.push({
      icon: "🔥",
      title: `${hot.length} leads calientes por contactar`,
      detail: `${hotStale.length} llevan más de 3 días sin actividad. Un llamado hoy puede cerrar ventas de alto valor.`,
      tone: "opp",
    });
  }
  const dvs = demandVsStock(leads);
  const gap = dvs.find((d) => d.status === "alta");
  if (gap) {
    recs.push({
      icon: "📦",
      title: `Alta demanda de ${gap.body} con poco stock`,
      detail: `${gap.demandPct}% del interés apunta a ${gap.body} y solo tienes ${gap.stock} en catálogo. Reponer inventario ahí aumentaría ventas.`,
      tone: "warn",
    });
  }
  const ch = channels(leads).slice().sort((a, b) => b.conversion - a.conversion)[0];
  if (ch) {
    recs.push({
      icon: "📣",
      title: `${ch.name} es tu canal con mejor conversión (${ch.conversion}%)`,
      detail: `Reasignar presupuesto de marketing hacia ${ch.name} mejora el retorno por lead.`,
      tone: "good",
    });
  }
  const fin = financing(leads);
  if (fin.wantsPct > 0) {
    recs.push({
      icon: "💳",
      title: `${fin.wantsPct}% de los leads pide financiamiento`,
      detail: `Priorizar convenios con financieras acelera el cierre.`,
      tone: "opp",
    });
  }
  const tr = salesTrend(leads);
  if (tr.slope > 0) {
    recs.push({
      icon: "📈",
      title: "Tendencia de ventas al alza",
      detail: `La proyección estima ${formatCLPShort(tr.forecast[0].revenue)} el próximo mes. Mantén el stock de los modelos más buscados.`,
      tone: "good",
    });
  }
  return recs;
}

// ---- Ranking de Modelos Más Vendidos & Compra Inteligente (Reposición) ----
export type ProcurementOpportunity = {
  rank: number;
  brand: string;
  model: string;
  bodyType: BodyType;
  salesCount: number;
  activeLeads: number;
  currentStock: number;
  avgDaysToSell: number;
  avgRetailPrice: number;
  targetBuyPrice: number;
  estGrossMargin: number;
  estMarginPct: number;
  turnoverSpeed: "Ultra Rápida (<10d)" | "Rápida (10-20d)" | "Normal (20-35d)" | "Lenta (>35d)";
  recommendation: "Comprar Urgente" | "Alta Rotación" | "Stock Óptimo" | "Pausar Compras";
  recommendationReason: string;
  badgeColor: string;
};

export type BrandMarketShare = {
  brand: string;
  salesCount: number;
  leadsCount: number;
  sharePct: number;
  avgTicket: number;
  color: string;
};

const BRAND_COLORS: Record<string, string> = {
  Toyota: "#EF4444",
  Mazda: "#3B82F6",
  Hyundai: "#0EA5E9",
  Ford: "#2563EB",
  Suzuki: "#10B981",
  Chevrolet: "#F59E0B",
  Nissan: "#8B5CF6",
  Kia: "#EC4899",
  Volkswagen: "#6366F1",
};
void BRAND_COLORS;

export function topSellingModelsAndProcurement(
  leads: Lead[],
  catalogVehicles: Vehicle[] = vehicles
): ProcurementOpportunity[] {
  if (!isDemoAnalytics()) {
    void leads;
    void catalogVehicles;
    return [];
  }
  return [];
}

export function brandMarketShare(leads: Lead[]): BrandMarketShare[] {
  if (!isDemoAnalytics()) {
    void leads;
    return [];
  }
  return [];
}

// ---- Autos Más Buscados SIN STOCK (Demanda Insatisfecha / Venta Asegurada) ----
export type UnmetDemandVehicle = {
  id: string;
  brand: string;
  model: string;
  yearRange: string;
  bodyType: BodyType;
  waitlistBuyers: number;
  searchVolume30d: number;
  avgBudget: number;
  targetAcquisitionPrice: number;
  estGrossProfit: number;
  timeToSellHours: string;
  urgencyScore: number;
  urgencyLevel: "CRÍTICA (Comprar Ya)" | "ALTA (Venta 48h)" | "MODERADA";
  buyerProfiles: { name: string; phone: string; budget: number; status: string }[];
};

export function unmetDemandZeroStock(catalogVehicles: Vehicle[] = vehicles): UnmetDemandVehicle[] {
  if (!isDemoAnalytics()) {
    void catalogVehicles;
    return [];
  }
  return [];
}

// ---- Helpers ---------------------------------------------------------------
function pct(a: number, b: number) {
  return b ? Math.round((a / b) * 100) : 0;
}

export function formatCLPShort(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}MM`;
  if (v >= 1_000_000) return `$${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}
