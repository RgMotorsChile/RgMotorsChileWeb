import { test, expect } from "@playwright/test";

const page_base = () =>
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

test.describe("Sitio público", () => {
  test("carga la home y muestra marca RG Motors", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/RG|Motors|Puerto|vehículo|auto/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("navega al catálogo", async ({ page }) => {
    await page.goto("/catalogo");
    await expect(page.getByRole("main")).toContainText(
      /catálogo|vehículo|filtr|precio|toyota|mazda|buscar|auto/i,
    );
  });

  test("el listado abre el detalle de un vehículo", async ({ page }) => {
    const shot = process.env.E2E_SCREENSHOT_DIR;
    await page.goto("/catalogo");
    const card = page.locator('a[href^="/vehiculo/"]').first();
    await expect(card).toBeVisible();
    if (shot) {
      await page.screenshot({ path: `${shot}/catalogo-listado.png`, fullPage: true });
    }
    await card.click();
    await expect(page).toHaveURL(/\/vehiculo\/.+/);
    await expect(page.getByRole("main")).toContainText(
      /ficha técnica|precio|disponible|km/i,
    );
    if (shot) {
      await page.screenshot({ path: `${shot}/vehiculo-detalle.png`, fullPage: true });
    }
  });

  test("catálogo y ficha no publican campos internos", async ({ page }) => {
    const forbidden = [
      "listPrice",
      "techReview",
      "circPermit",
      "coverLocked",
      "ownersCount",
      '"supplier"',
      '"owners"',
      '"plate"',
      '"payload"',
    ];
    await page.goto("/");
    const homeHtml = await page.content();
    for (const key of forbidden) {
      expect(homeHtml, `/ ${key}`).not.toContain(key);
    }
    await page.goto("/catalogo");
    const catalogHtml = await page.content();
    for (const key of forbidden) {
      expect(catalogHtml, `/catalogo ${key}`).not.toContain(key);
    }
    const href = await page.locator('a[href^="/vehiculo/"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    const detailHtml = await page.content();
    for (const key of forbidden) {
      expect(detailHtml, key).not.toContain(key);
    }
  });

  test("simulador retirado: /simulador redirige al catálogo", async ({ page }) => {
    await page.goto("/simulador");
    await expect(page).toHaveURL(/\/catalogo$/);
    await expect(page.locator("body")).not.toContainText(/simula|preaprob|pre-aprob/i);
  });

  test("sin simulador ni cuotas: solo precio de venta", async ({ page }) => {
    const noCuota = /simula|\/mes\b|desde \$|cuota desde/i;
    await page.goto("/");
    await expect(page.locator("body")).not.toContainText(noCuota);
    await page.goto("/catalogo");
    const href = await page.locator('a[href^="/vehiculo/"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    await expect(page.locator("body")).not.toContainText(noCuota);
    await page.goto(href!);
    await expect(page.getByRole("main")).not.toContainText(noCuota);
    await page.goto("/comparador");
    await expect(page.locator("body")).not.toContainText(noCuota);
  });

  test("ficha: fotos estables, sin simulador y sin desborde", async ({ page }) => {
    await page.goto("/catalogo");
    const href = await page.locator('a[href^="/vehiculo/"]').first().getAttribute("href");
    await page.goto(href!);
    const main = page.getByRole("main");
    await expect(main).not.toContainText(/simula|\/mes/i);
    await expect(main).toContainText(/consigna tu vehículo/i);
    // Foto real o placeholder, nunca ambos; una vez cargada la página no cambia.
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    const states: string[] = [];
    for (let i = 0; i < 6; i++) {
      const pending = await page.locator('[data-testid="photos-pending"]').count();
      const photos = await main.locator('img[alt*="Foto"]').count();
      states.push(`${pending}/${photos > 0 ? 1 : 0}`);
      await page.waitForTimeout(250);
    }
    expect(new Set(states).size, states.join(" ")).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("consigna valida datos en el servidor", async ({ request }) => {
    const res = await request.post("/api/consigna", {
      data: { name: "x" },
      headers: { origin: new URL(page_base()).origin },
    });
    expect(res.status()).toBe(400);
  });

  test("páginas legales existen", async ({ page }) => {
    await page.goto("/privacidad");
    await expect(page.getByRole("main")).toContainText(/privacidad|datos|personal/i);

    await page.goto("/terminos");
    await expect(page.getByRole("main")).toContainText(/términos|condiciones|uso/i);

    await page.goto("/aviso-credito");
    await expect(page.getByRole("main")).toContainText(/crédito|aviso|sernac/i);
  });

  test("admin login es accesible; panel exige auth", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("body")).toContainText(/admin|usuario|contraseña|ingresar|acceso/i);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
