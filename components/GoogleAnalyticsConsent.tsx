"use client";

import { useEffect, useSyncExternalStore } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import {
  COOKIE_CONSENT_EVENT,
  GA_ID,
  flushPendingEvents,
  hasAnalyticsConsent,
  trackEvent,
} from "@/lib/googleAnalytics";

const WHATSAPP_HREF = /^https:\/\/(wa\.me|api\.whatsapp\.com)\//i;

function subscribe(onChange: () => void) {
  window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
}

function setGaDisabled(disabled: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = disabled;
}

/**
 * GA4 solo en el sitio público: se monta en app/(site)/layout, por lo que nunca
 * carga en /admin ni /cuenta. Requiere NEXT_PUBLIC_GA_ID y consentimiento de cookies.
 *
 * Las páginas vistas en navegación cliente las registra GA4 con la medición mejorada
 * ("cambios de página según eventos del historial del navegador", activa por defecto).
 */
export default function GoogleAnalyticsConsent() {
  const consented = useSyncExternalStore(subscribe, hasAnalyticsConsent, () => false);
  const active = Boolean(GA_ID) && consented;

  useEffect(() => {
    if (!active) return;
    setGaDisabled(false);
    flushPendingEvents();

    // Clics en enlaces de WhatsApp y teléfono de todo el sitio, sin tocar cada botón.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const href = link?.getAttribute("href") ?? "";
      if (WHATSAPP_HREF.test(href)) trackEvent("whatsapp_click");
      else if (href.startsWith("tel:")) trackEvent("phone_click");
    };
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      // Si se navega del sitio público a /admin, gtag ya cargado deja de enviar datos.
      setGaDisabled(true);
    };
  }, [active]);

  return active ? <GoogleAnalytics gaId={GA_ID} /> : null;
}
