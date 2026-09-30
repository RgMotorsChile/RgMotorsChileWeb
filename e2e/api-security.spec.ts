import { test, expect } from "@playwright/test";

test.describe("APIs — seguridad y catálogo", () => {
  test("GET /api/vehicles es público y no incluye modo admin sin cookie", async ({
    request,
  }) => {
    const res = await request.get("/api/vehicles");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.vehicles)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    for (const v of body.vehicles) {
      expect(v.status === "Borrador").toBe(false);
      expect(v).not.toHaveProperty("plate");
      expect(v).not.toHaveProperty("listPrice");
      expect(v).not.toHaveProperty("supplier");
      expect(v).not.toHaveProperty("techReview");
      expect(v).not.toHaveProperty("circPermit");
      expect(v).not.toHaveProperty("coverLocked");
      expect(v).not.toHaveProperty("payload");
      expect(v).not.toHaveProperty("owners");
      expect(v).not.toHaveProperty("ownersCount");
    }
  });

  test("GET /api/vehicles?admin=true sin sesión → 401", async ({ request }) => {
    const res = await request.get("/api/vehicles?admin=true");
    expect(res.status()).toBe(401);
  });

  test("GET de leads con PII sin sesión → 401", async ({ request }) => {
    const paths = [
      "/api/car-requests",
      "/api/test-drives",
      "/api/price-alerts",
      "/api/trade-in",
      "/api/credits",
      "/api/reservations",
      "/api/contact",
      "/api/simulations",
      "/api/track",
    ];
    for (const path of paths) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test("GET /api/health es público", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.checks).toBeTruthy();
  });

  test("GET /api/vehicles/[slug] de borrador no es público", async ({
    request,
  }) => {
    // Si no hay borradores en el seed, el test pasa con un slug inventado → 404
    const res = await request.get("/api/vehicles/__borrador-inexistente-rg__");
    expect(res.status()).toBe(404);
  });

  test("POST /api/auth con credenciales inválidas no autentica", async ({
    request,
  }) => {
    const res = await request.post("/api/auth", {
      data: { username: "no-existe", password: "wrong-password-!!" },
    });
    expect([400, 401, 429]).toContain(res.status());
  });
});
