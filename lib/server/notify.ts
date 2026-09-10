import { COMPANY } from "@/lib/company";
import { readJson, writeJson } from "@/lib/server/db";

export type NotificationEvent = {
  id: string;
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  channel: "log" | "email" | "email-pending";
};

const FILENAME = "notifications.json";

function sanitizeMetaForLog(meta?: Record<string, unknown>) {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase();
    if (
      key.includes("email") ||
      key.includes("phone") ||
      key.includes("tel") ||
      key.includes("rut") ||
      key.includes("contact") ||
      key.includes("whatsapp")
    ) {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function defaultFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    `RG Motors <noreply@${COMPANY.website.replace(/^www\./, "")}>`
  );
}

function defaultReplyTo(): string | undefined {
  const reply =
    process.env.NOTIFY_EMAIL?.trim() ||
    process.env.COMPANY_EMAIL?.trim() ||
    COMPANY.email;
  return reply || undefined;
}

/**
 * Envío transaccional vía Resend.
 * Requiere RESEND_API_KEY y dominio verificado (rgmotorschile.cl).
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const to = opts.to.trim();
  if (!to || !to.includes("@")) return false;

  try {
    const payload: Record<string, unknown> = {
      from: defaultFrom(),
      to: [to],
      subject: opts.subject,
      text: opts.text,
    };
    if (opts.html) payload.html = opts.html;
    const replyTo = opts.replyTo || defaultReplyTo();
    if (replyTo) payload.reply_to = replyTo;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn("[RG NOTIFY] Resend error:", res.status, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[RG NOTIFY] Resend falló:", err);
    return false;
  }
}

async function persistNotification(
  entry: NotificationEvent,
): Promise<NotificationEvent> {
  const list = await readJson<NotificationEvent[]>(FILENAME, []);
  list.unshift(entry);
  await writeJson(FILENAME, list.slice(0, 500));
  return entry;
}

/**
 * Notifica al equipo comercial (NOTIFY_EMAIL / COMPANY.email).
 */
export async function notifyTeam(event: {
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}): Promise<NotificationEvent> {
  const to = process.env.NOTIFY_EMAIL?.trim() || COMPANY.email;
  const emailed = await sendEmail({
    to,
    subject: `[RG Motors] ${event.title}`,
    text: `${event.body}\n\nTipo: ${event.type}\nFecha: ${new Date().toISOString()}`,
  });

  const entry: NotificationEvent = {
    id: `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: event.type,
    title: event.title,
    body: event.body,
    meta: event.meta,
    createdAt: new Date().toISOString(),
    channel: emailed ? "email" : "email-pending",
  };

  if (!emailed) {
    console.error(
      "[RG NOTIFY] Email al equipo NO enviado (email-pending). Revisá RESEND_API_KEY, EMAIL_FROM y dominio.",
      { type: entry.type, title: entry.title },
    );
  } else {
    console.info("[RG NOTIFY] Equipo", {
      type: entry.type,
      title: entry.title,
      channel: entry.channel,
      meta: sanitizeMetaForLog(entry.meta),
    });
  }

  return persistNotification(entry);
}

/**
 * Correo al cliente (confirmaciones, etc.).
 */
export async function notifyCustomer(event: {
  to: string;
  type: string;
  title: string;
  body: string;
  html?: string;
  meta?: Record<string, unknown>;
}): Promise<NotificationEvent> {
  const emailed = await sendEmail({
    to: event.to,
    subject: event.title,
    text: event.body,
    html: event.html,
  });

  const entry: NotificationEvent = {
    id: `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: event.type,
    title: event.title,
    body: event.body,
    meta: { ...event.meta, audience: "customer" },
    createdAt: new Date().toISOString(),
    channel: emailed ? "email" : "email-pending",
  };

  if (!emailed) {
    console.error(
      "[RG NOTIFY] Email al cliente NO enviado (email-pending).",
      { type: entry.type, title: entry.title },
    );
  } else {
    console.info("[RG NOTIFY] Cliente", {
      type: entry.type,
      title: entry.title,
      channel: entry.channel,
    });
  }

  return persistNotification(entry);
}

/** Plantillas de prueba de manejo. */
export function buildTestDriveEmails(data: {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  vehicleTitle: string;
  branch: string;
  date: string;
  time: string;
  executive?: string;
  id: string;
}) {
  const teamBody = [
    "Nueva prueba de manejo agendada — preparar el vehículo a tiempo.",
    "",
    `Cliente: ${data.clientName}`,
    `Teléfono: ${data.clientPhone}`,
    `Email: ${data.clientEmail}`,
    `Vehículo: ${data.vehicleTitle}`,
    `Sucursal: ${data.branch}`,
    `Fecha: ${data.date}`,
    `Hora: ${data.time}`,
    `Ejecutivo preferido: ${data.executive || "Sin preferencia"}`,
    `ID: ${data.id}`,
    "",
    `WhatsApp rápido: https://wa.me/${COMPANY.whatsapp}`,
  ].join("\n");

  const customerBody = [
    `Hola ${data.clientName},`,
    "",
    "Confirmamos tu solicitud de prueba de manejo en RG Motors.",
    "",
    `Vehículo: ${data.vehicleTitle}`,
    `Sucursal: ${data.branch}`,
    `Fecha: ${data.date}`,
    `Hora: ${data.time}`,
    "",
    "Te esperamos unos minutos antes. Si necesitás reprogramar o cancelar, respondé este correo o escribinos por WhatsApp.",
    "",
    `WhatsApp: +${COMPANY.whatsapp.replace(/^56/, "56 ")}`,
    `Dirección: ${COMPANY.address}`,
    `Horario: ${COMPANY.hours}`,
    "",
    "— Equipo RG Motors",
    COMPANY.website,
  ].join("\n");

  const customerHtml = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="color:#173A79">Prueba de manejo confirmada</h2>
      <p>Hola <strong>${escapeHtml(data.clientName)}</strong>,</p>
      <p>Confirmamos tu solicitud de prueba de manejo en <strong>RG Motors</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;color:#666">Vehículo</td><td style="padding:8px 0;font-weight:600">${escapeHtml(data.vehicleTitle)}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Sucursal</td><td style="padding:8px 0;font-weight:600">${escapeHtml(data.branch)}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Fecha</td><td style="padding:8px 0;font-weight:600">${escapeHtml(data.date)}</td></tr>
        <tr><td style="padding:8px 0;color:#666">Hora</td><td style="padding:8px 0;font-weight:600">${escapeHtml(data.time)}</td></tr>
      </table>
      <p style="color:#444;font-size:14px">Te esperamos unos minutos antes. Si necesitás reprogramar, respondé este correo o escribinos por WhatsApp.</p>
      <p style="font-size:14px">
        WhatsApp: <a href="https://wa.me/${COMPANY.whatsapp}">+${COMPANY.whatsapp}</a><br/>
        ${escapeHtml(COMPANY.address)}<br/>
        ${escapeHtml(COMPANY.hours)}
      </p>
      <p style="color:#888;font-size:12px">— Equipo RG Motors · ${escapeHtml(COMPANY.website)}</p>
    </div>
  `.trim();

  return { teamBody, customerBody, customerHtml };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
