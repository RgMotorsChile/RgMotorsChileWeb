/**
 * Google Analytics 4 (gtag) para el sitio público.
 *
 * Solo mide si:
 *  - NEXT_PUBLIC_GA_ID tiene un ID de flujo web válido (G-XXXXXXXXXX) en el build, y
 *  - el visitante aceptó la medición en el aviso de cookies (CookieConsent).
 * Sin ID o sin consentimiento, todo es no-op: no se carga ningún script de Google.
 */

const RAW_GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? "";

export const GA_ID = /^G-[A-Z0-9]+$/i.test(RAW_GA_ID) ? RAW_GA_ID : "";

/** Misma clave/evento que usan CookieConsent y TrafficTracker. */
export const COOKIE_CONSENT_KEY = "rg_cookie_consent_v1";
export const COOKIE_CONSENT_EVENT = "rg-cookie-consent";

export type AnalyticsParams = Record<string, unknown>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function hasAnalyticsConsent(): boolean {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

const MAX_PENDING = 20;
const pending: Array<[string, AnalyticsParams | undefined]> = [];

/**
 * Envía un evento GA4. Si gtag aún no se inicializa (se monta después de hidratar)
 * pero hay consentimiento, lo encola y se envía al cargar GA.
 */
export function trackEvent(name: string, params?: AnalyticsParams): void {
  if (!GA_ID || typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", name, params);
    return;
  }
  if (hasAnalyticsConsent() && pending.length < MAX_PENDING) {
    pending.push([name, params]);
  }
}

/** Envía los eventos encolados antes de que gtag estuviera listo. */
export function flushPendingEvents(): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  for (const [name, params] of pending.splice(0)) {
    window.gtag("event", name, params);
  }
}
