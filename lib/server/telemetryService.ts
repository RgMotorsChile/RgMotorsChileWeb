import { readJson } from "@/lib/server/db";
import { getPageviewStats } from "@/lib/server/pageviewsStore";
import { getVehicles } from "@/lib/server/vehiclesStore";
import { getSoldVehicles } from "@/lib/server/soldVehiclesStore";
import { getReservations } from "@/lib/server/reservationsStore";
import { getTestDrives } from "@/lib/server/testDrivesStore";
import { getCreditApplications } from "@/lib/server/creditsStore";
import { getTradeInRequests } from "@/lib/server/tradeInStore";
import { getCarRequests } from "@/lib/server/carRequestsStore";
import { getPriceAlerts } from "@/lib/server/priceAlertsStore";
import { getSimulationEvents } from "@/lib/server/simulationsStore";
import {
  assertProductionStorage,
  isBlobReady,
  isKvReady,
  isVercelProduction,
} from "@/lib/server/storageHealth";
import type { NotificationEvent } from "@/lib/server/notify";

type ContactLike = { createdAt?: string; trafficSource?: unknown };

type PeriodKey = "today" | "month" | "year" | "all";

function chileParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const key = fmt.format(d); // YYYY-MM-DD
  return { key, year: key.slice(0, 4), month: key.slice(0, 7) };
}

function eventTime(isoOrDate?: string): number {
  if (!isoOrDate) return 0;
  const t = Date.parse(isoOrDate);
  return Number.isNaN(t) ? 0 : t;
}

function inPeriod(isoOrDate: string | undefined, period: PeriodKey): boolean {
  if (period === "all") return true;
  const t = eventTime(isoOrDate);
  if (!t) return false;
  const { key, year, month } = chileParts(new Date(t));
  const now = chileParts();
  if (period === "today") return key === now.key;
  if (period === "month") return month === now.month;
  return year === now.year;
}

function sourceOf(traffic: unknown): string {
  if (!traffic || typeof traffic !== "object") return "Directo";
  const s = (traffic as { source?: string }).source;
  return s?.trim() || "Directo";
}

function countBySource(
  items: { trafficSource?: unknown }[],
): { source: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const s = sourceOf(item.trafficSource);
    map.set(s, (map.get(s) || 0) + 1);
  }
  return [...map.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function periodCounts<T>(
  items: T[],
  getDate: (x: T) => string | undefined,
): Record<PeriodKey, number> {
  return {
    today: items.filter((x) => inPeriod(getDate(x), "today")).length,
    month: items.filter((x) => inPeriod(getDate(x), "month")).length,
    year: items.filter((x) => inPeriod(getDate(x), "year")).length,
    all: items.length,
  };
}

export async function buildTelemetryReport() {
  const [
    pageviews,
    vehicles,
    sold,
    reservations,
    testDrives,
    credits,
    tradeIns,
    carRequests,
    priceAlerts,
    simulations,
    contacts,
    notifications,
    leads,
  ] = await Promise.all([
    getPageviewStats(),
    getVehicles({ bypassCache: true }),
    getSoldVehicles(),
    getReservations(),
    getTestDrives(),
    getCreditApplications(),
    getTradeInRequests(),
    getCarRequests(),
    getPriceAlerts(),
    getSimulationEvents(),
    readJson<ContactLike[]>("contact-messages.json", []),
    readJson<NotificationEvent[]>("notifications.json", []),
    readJson<ContactLike[]>("leads.json", []),
  ]);

  const storage = assertProductionStorage();
  const sessionOk = Boolean(
    process.env.ADMIN_SESSION_SECRET &&
      process.env.ADMIN_SESSION_SECRET.trim().length >= 32 &&
      !/change-me|rgmotors-dev/i.test(process.env.ADMIN_SESSION_SECRET),
  );
  const cronOk = Boolean(
    process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length >= 16,
  );
  const resendOk = Boolean(process.env.RESEND_API_KEY?.trim());

  const emailPending = notifications.filter((n) => n.channel === "email-pending");
  const emailOkRecent = notifications
    .slice(0, 30)
    .filter((n) => n.channel === "email").length;
  const emailFailRecent = notifications
    .slice(0, 30)
    .filter((n) => n.channel === "email-pending").length;

  const available = vehicles.filter(
    (v) => (v.status || "Disponible") === "Disponible",
  ).length;
  const drafts = vehicles.filter((v) => v.status === "Borrador").length;
  const stockValue = vehicles.reduce((a, v) => a + (v.price || 0), 0);

  const soldThisMonth = sold.filter((s) => inPeriod(s.soldAt, "month")).length;
  const soldThisYear = sold.filter((s) => inPeriod(s.soldAt, "year")).length;

  const simLeads = simulations.filter((s) => s.eventType === "lead_submit");
  const pendingRes = reservations.filter((r) => r.status === "Pendiente").length;
  const pendingTd = testDrives.filter(
    (t) => t.status === "Pendiente" || t.status === "Confirmada",
  ).length;

  const businessSignals = {
    contacts: periodCounts(contacts, (c) => c.createdAt),
    chatLeads: periodCounts(leads, (l) => l.createdAt),
    testDrives: periodCounts(testDrives, (t) => t.createdAt),
    reservations: periodCounts(reservations, (r) => r.date),
    credits: periodCounts(credits, (c) => c.date),
    tradeIns: periodCounts(tradeIns, (t) => t.date),
    carRequests: periodCounts(carRequests, (c) => c.date),
    priceAlerts: periodCounts(priceAlerts, (p) => p.date),
    simulationLeads: periodCounts(simLeads, (s) => s.createdAt),
  };

  const interestThisMonth =
    businessSignals.contacts.month +
    businessSignals.chatLeads.month +
    businessSignals.testDrives.month +
    businessSignals.reservations.month +
    businessSignals.credits.month +
    businessSignals.tradeIns.month +
    businessSignals.carRequests.month +
    businessSignals.priceAlerts.month +
    businessSignals.simulationLeads.month;

  const interestToday =
    businessSignals.contacts.today +
    businessSignals.chatLeads.today +
    businessSignals.testDrives.today +
    businessSignals.reservations.today +
    businessSignals.credits.today +
    businessSignals.tradeIns.today +
    businessSignals.carRequests.today +
    businessSignals.priceAlerts.today +
    businessSignals.simulationLeads.today;

  const channelItems = [
    ...contacts,
    ...leads,
    ...testDrives,
    ...reservations,
    ...credits,
    ...simLeads,
  ];
  const channels = countBySource(channelItems);

  const healthChecks: {
    id: string;
    label: string;
    plain: string;
    ok: boolean;
    severity: "critical" | "warn" | "info";
  }[] = [
    {
      id: "kv",
      label: "Base de datos",
      plain: isKvReady()
        ? "Los datos del sitio se guardan correctamente."
        : "No hay conexión a la base de datos. El catálogo puede no actualizarse.",
      ok: isKvReady(),
      severity: "critical",
    },
    {
      id: "blob",
      label: "Fotos y archivos",
      plain: isBlobReady()
        ? "El almacenamiento de fotos está operativo."
        : "Falta el almacenamiento de fotos (Blob).",
      ok: isBlobReady(),
      severity: "critical",
    },
    {
      id: "email",
      label: "Correo al equipo",
      plain: resendOk
        ? emailFailRecent > emailOkRecent && emailFailRecent > 0
          ? "Hay avisos recientes que no se enviaron por correo. Revisá Resend."
          : "El envío de correos está configurado."
        : "Falta la clave de Resend: los avisos no llegan por email.",
      ok: resendOk && emailFailRecent === 0,
      severity: "warn",
    },
    {
      id: "session",
      label: "Seguridad del admin",
      plain: sessionOk
        ? "La sesión del administrador está bien protegida."
        : "Hay que reforzar el secreto de sesión del admin.",
      ok: sessionOk,
      severity: "critical",
    },
    {
      id: "cron",
      label: "Sincronización automática",
      plain: cronOk
        ? "El cron de Sheets/Drive está configurado (08:00 y 19:00 Chile)."
        : "Falta CRON_SECRET: la sync automática puede no correr en producción.",
      ok: cronOk || !isVercelProduction(),
      severity: "warn",
    },
  ];

  const criticalFail = healthChecks.filter(
    (c) => !c.ok && c.severity === "critical",
  ).length;
  const warnFail = healthChecks.filter(
    (c) => !c.ok && c.severity === "warn",
  ).length;

  let status: "excellent" | "good" | "attention" | "critical" = "excellent";
  let statusTitle = "Todo en orden";
  let statusSubtitle =
    "El sitio web y los sistemas de RG Motors están funcionando bien.";
  if (criticalFail > 0) {
    status = "critical";
    statusTitle = "Atención urgente";
    statusSubtitle =
      "Hay un problema técnico que puede afectar el catálogo o el panel. Revisá la sección Salud del proyecto.";
  } else if (warnFail > 0 || emailPending.length > 5) {
    status = "attention";
    statusTitle = "Requiere un vistazo";
    statusSubtitle =
      "El sitio opera, pero hay avisos que conviene resolver pronto.";
  } else if (interestThisMonth > 0 || pageviews.month.views > 0) {
    status = "good";
    statusTitle = "Negocio activo";
    statusSubtitle =
      "Hay visitas e interés de clientes. Seguí respondiendo leads a tiempo.";
  }

  const conversionHint =
    pageviews.month.uniques > 0
      ? Math.round((interestThisMonth / pageviews.month.uniques) * 1000) / 10
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    status: {
      level: status,
      title: statusTitle,
      subtitle: statusSubtitle,
    },
    visits: pageviews,
    business: {
      interestToday,
      interestThisMonth,
      conversionRateMonthPct: conversionHint,
      pendingReservations: pendingRes,
      pendingTestDrives: pendingTd,
      soldThisMonth,
      soldThisYear,
      signals: businessSignals,
      channels,
    },
    inventory: {
      total: vehicles.length,
      available,
      drafts,
      soldTotal: sold.length,
      stockValue,
    },
    health: {
      ok: storage.ok && (criticalFail === 0),
      env: isVercelProduction() ? "production" : process.env.VERCEL_ENV || "local",
      checks: healthChecks,
      warnings: storage.warnings,
      emailPendingCount: emailPending.length,
    },
    activity: notifications.slice(0, 12).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      channel: n.channel,
      ok: n.channel === "email" || n.channel === "log",
    })),
  };
}

export type TelemetryReport = Awaited<ReturnType<typeof buildTelemetryReport>>;
