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

async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from =
    process.env.EMAIL_FROM?.trim() ||
    `RG Motors <noreply@${COMPANY.website.replace(/^www\./, "")}>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn("[RG NOTIFY] Resend error:", res.status, detail.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[RG NOTIFY] Resend falló:", err);
    return false;
  }
}

/**
 * Notifica al equipo comercial.
 * Con RESEND_API_KEY envía email real; si no, persiste + log (sin PII completa).
 */
export async function notifyTeam(event: {
  type: string;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}): Promise<NotificationEvent> {
  const to = process.env.NOTIFY_EMAIL?.trim() || COMPANY.email;
  const emailed = await sendResendEmail({
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
      "[RG NOTIFY] Email NO enviado (email-pending). Revisá RESEND_API_KEY, EMAIL_FROM y dominio verificado.",
      { to, type: entry.type, title: entry.title },
    );
  } else {
    console.info("[RG NOTIFY]", {
      to,
      type: entry.type,
      title: entry.title,
      channel: entry.channel,
      meta: sanitizeMetaForLog(entry.meta),
    });
  }

  const list = await readJson<NotificationEvent[]>(FILENAME, []);
  list.unshift(entry);
  await writeJson(FILENAME, list.slice(0, 500));
  return entry;
}
