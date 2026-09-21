import { NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimitAsync } from "@/lib/server/rateLimit";
import { validateRut } from "@/lib/rut";

/** Campos honeypot típicos: si vienen llenos, es bot. */
export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  const traps = ["website", "company_url", "fax", "hp_field"];
  return traps.some((k) => {
    const v = body[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Teléfono Chile: 8–11 dígitos útiles (+56 opcional). */
export function isValidChilePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 11) return false;
  if (digits.startsWith("56") && digits.length >= 10) return true;
  if (digits.startsWith("9") && digits.length === 9) return true;
  if (digits.length >= 8 && digits.length <= 9) return true;
  return false;
}

export function optionalValidRut(rut: string | undefined | null): string | null {
  if (rut == null || String(rut).trim() === "") return null;
  if (!validateRut(String(rut))) return "RUT inválido.";
  return null;
}

/**
 * En producción exige Origin/Referer del mismo host (anti-CSRF básico para POST públicos).
 * En local/CI se relaja para no romper Playwright.
 * Rutas máquina (cron/webhook con Bearer) no usan Origin: Apps Script no lo envía.
 */
export function rejectUntrustedOrigin(req: NextRequest | Request): NextResponse | null {
  const enforce =
    process.env.VERCEL_ENV === "production" ||
    process.env.FORCE_ORIGIN_CHECK === "1";
  if (!enforce || process.env.SECURITY_RELAX_ORIGIN === "1") return null;

  const host = req.headers.get("host") || "";
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  const allowedHosts = new Set<string>();
  if (host) allowedHosts.add(host.toLowerCase());
  if (process.env.VERCEL_URL) allowedHosts.add(process.env.VERCEL_URL.toLowerCase());
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowedHosts.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host.toLowerCase());
    } catch {
      /* noop */
    }
  }

  const hostFrom = (value: string | null): string | null => {
    if (!value) return null;
    try {
      return new URL(value).host.toLowerCase();
    } catch {
      return null;
    }
  };

  const o = hostFrom(origin);
  const r = hostFrom(referer);
  if (o && allowedHosts.has(o)) return null;
  if (!o && r && allowedHosts.has(r)) return null;

  return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
}

export type LeadGuardOk = { ok: true; body: Record<string, unknown> };
export type LeadGuardFail = { ok: false; response: NextResponse };

/**
 * Guard común para POST de leads públicos: origin + rate limit + honeypot + JSON.
 */
export async function guardPublicLeadPost(
  req: NextRequest,
  bucket: string,
  limit = 8,
  windowMs = 60_000,
): Promise<LeadGuardOk | LeadGuardFail> {
  const originBlock = rejectUntrustedOrigin(req);
  if (originBlock) return { ok: false, response: originBlock };

  const rl = await rateLimitAsync(clientKey(req, bucket), limit, windowMs);
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Demasiados envíos. Intenta en un minuto." },
        { status: 429 },
      ),
    };
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }),
    };
  }

  if (isHoneypotTriggered(body)) {
    // Respuesta falsa OK para no enseñar el honeypot a bots
    return {
      ok: false,
      response: NextResponse.json({ success: true }),
    };
  }

  return { ok: true, body };
}

/** CSP + cabeceras — fuente única; vercel.json debe espejar script/style críticos. */
export function securityHeaders(): Record<string, string> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.rgmotorschile.cl";
  let siteHost = "www.rgmotorschile.cl";
  try {
    siteHost = new URL(site).host;
  } catch {
    /* noop */
  }

  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "on",
    "Cross-Origin-Opener-Policy": "same-origin",
    // Next App Router aún requiere inline para bootstrap; sin unsafe-eval.
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com https://drive.google.com",
      "font-src 'self' data:",
      `connect-src 'self' https://${siteHost} https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com`,
      "frame-src 'self' https://maps.google.com https://www.google.com https://www.google.com/maps",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  };
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}

export function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(securityHeaders())) {
    res.headers.set(k, v);
  }
  return res;
}
