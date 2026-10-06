import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadAnalytics(gaId: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_GA_ID", gaId ?? "");
  return import("@/lib/googleAnalytics");
}

/** localStorage en memoria (el de jsdom no siempre está disponible según la versión de Node). */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

describe("analytics (GA4)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    delete window.gtag;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete window.gtag;
  });

  it("sin NEXT_PUBLIC_GA_ID no hace nada", async () => {
    const { GA_ID, trackEvent } = await loadAnalytics(undefined);
    window.gtag = vi.fn();
    trackEvent("whatsapp_click");
    expect(GA_ID).toBe("");
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("ignora IDs con formato inválido", async () => {
    const { GA_ID } = await loadAnalytics("UA-12345-1");
    expect(GA_ID).toBe("");
  });

  it("envía el evento cuando gtag está cargado", async () => {
    const { GA_ID, trackEvent } = await loadAnalytics("G-TEST123");
    window.gtag = vi.fn();
    trackEvent("generate_lead", { form_name: "contacto" });
    expect(GA_ID).toBe("G-TEST123");
    expect(window.gtag).toHaveBeenCalledWith("event", "generate_lead", { form_name: "contacto" });
  });

  it("con consentimiento encola hasta que gtag esté listo", async () => {
    const { trackEvent, flushPendingEvents, COOKIE_CONSENT_KEY } = await loadAnalytics("G-TEST123");
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    trackEvent("view_item", { value: 1 });
    window.gtag = vi.fn();
    flushPendingEvents();
    flushPendingEvents();
    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith("event", "view_item", { value: 1 });
  });

  it("sin consentimiento descarta el evento", async () => {
    const { trackEvent, flushPendingEvents, COOKIE_CONSENT_KEY } = await loadAnalytics("G-TEST123");
    localStorage.setItem(COOKIE_CONSENT_KEY, "essential");
    trackEvent("view_item");
    window.gtag = vi.fn();
    flushPendingEvents();
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
