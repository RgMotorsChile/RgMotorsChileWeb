import { describe, expect, it } from "vitest";
import { isPublicApi, PII_LIST_PREFIXES } from "@/lib/auth/apiAccess";

describe("isPublicApi — política de acceso", () => {
  it("permite POST de leads sin auth", () => {
    expect(isPublicApi("/api/contact", "POST")).toBe(true);
    expect(isPublicApi("/api/reservations", "POST")).toBe(true);
    expect(isPublicApi("/api/car-requests", "POST")).toBe(true);
    expect(isPublicApi("/api/test-drives", "POST")).toBe(true);
    expect(isPublicApi("/api/credits", "POST")).toBe(true);
    expect(isPublicApi("/api/simulations", "POST")).toBe(true);
  });

  it("bloquea GET de listados con PII (requieren admin)", () => {
    for (const prefix of PII_LIST_PREFIXES) {
      expect(isPublicApi(prefix, "GET"), `${prefix} GET`).toBe(false);
      expect(isPublicApi(`${prefix}/abc`, "GET"), `${prefix}/id GET`).toBe(false);
    }
  });

  it("bloquea mutaciones admin sobre recursos", () => {
    expect(isPublicApi("/api/reservations/xyz", "PATCH")).toBe(false);
    expect(isPublicApi("/api/car-requests/xyz", "DELETE")).toBe(false);
    expect(isPublicApi("/api/vehicles", "POST")).toBe(false);
    expect(isPublicApi("/api/vehicles/slug", "PUT")).toBe(false);
  });

  it("permite catálogo público GET sin admin=true", () => {
    expect(isPublicApi("/api/vehicles", "GET")).toBe(true);
    expect(isPublicApi("/api/spin", "GET")).toBe(true);
    expect(isPublicApi("/api/settings", "GET")).toBe(true);
    expect(isPublicApi("/api/catalog/pdf", "GET")).toBe(true);
    expect(isPublicApi("/api/health", "GET")).toBe(true);
  });

  it("bloquea GET /api/vehicles?admin=true", () => {
    const params = new URLSearchParams({ admin: "true" });
    expect(isPublicApi("/api/vehicles", "GET", params)).toBe(false);
  });

  it("permite cron/webhook sin cookie (auth propia del endpoint)", () => {
    expect(isPublicApi("/api/cron/sync", "GET")).toBe(true);
    expect(isPublicApi("/api/cron/sync", "POST")).toBe(true);
    expect(isPublicApi("/api/webhooks/inventory-sync", "POST")).toBe(true);
    expect(isPublicApi("/api/webhooks/inventory-sync", "GET")).toBe(true);
  });

  it("bloquea POST /api/spin (solo admin)", () => {
    expect(isPublicApi("/api/spin", "POST")).toBe(false);
  });

  it("protege APIs admin no listadas (ej. sync-sheet)", () => {
    expect(isPublicApi("/api/sync-sheet", "POST")).toBe(false);
    expect(isPublicApi("/api/force-sync", "POST")).toBe(false);
  });
});
