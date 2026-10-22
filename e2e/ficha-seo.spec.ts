import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const shot = process.env.E2E_SCREENSHOT_DIR || "/opt/cursor/artifacts/screenshots";

async function openFirstVehicle(page: import("@playwright/test").Page) {
  await page.goto("/catalogo");
  const card = page.locator('a[href^="/vehiculo/"]').first();
  await expect(card).toBeVisible();
  const href = await card.getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
  return href!;
}

test.describe("Ficha, catálogo y SEO", () => {
  test("catálogo reserva las tarjetas y abre una ficha", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/catalogo");
    await expect(page.locator('a[href^="/vehiculo/"]').first()).toBeVisible();
    const ratio = await page.locator('a[href^="/vehiculo/"] [class*="aspect-"]').first().evaluate((el) => getComputedStyle(el).aspectRatio);
    expect(ratio === "auto" ? "" : ratio).not.toBe("");
    await page.screenshot({ path: `${shot}/catalogo-390.png`, fullPage: true });
    await openFirstVehicle(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await page.screenshot({ path: `${shot}/ficha-390.png`, fullPage: true });
  });

  test("ficha de escritorio, WhatsApp de RG y Open Graph", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/catalogo");
    await page.screenshot({ path: `${shot}/catalogo-1440.png`, fullPage: true });
    await openFirstVehicle(page);
    await expect(page).toHaveTitle(/usado en Puerto Montt \| RG Motors/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const wa = page.getByRole("link", { name: "Consultar por WhatsApp" });
    await expect(wa).toBeVisible();
    await expect(wa).toHaveAttribute("href", /wa\.me\/56959073127/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /RG Motors/);
    await expect(page.locator('meta[property="og:image"]')).not.toHaveAttribute("content", /^$/);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description || "").toMatch(/WhatsApp|visita/i);
    expect(description || "").toMatch(/\$/);
    await page.screenshot({ path: `${shot}/ficha-1440.png`, fullPage: true });
  });

  test("el footer acredita a South Software y no publica el hotmail", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Desarrollado por South Software" })).toHaveAttribute(
      "href",
      "https://southsoftware.cl",
    );
    await expect(page.locator("body")).not.toContainText("hotmail");
  });

  test("el Ranger queda en RG y el cruce de sitios sigue la planilla", async ({ request }) => {
    const rhcl = await request.get("/vehiculo/toyota-hilux-rhcl44", { maxRedirects: 0 });
    expect(rhcl.status()).not.toBe(301);
    expect(rhcl.status()).not.toBe(410);
    const ranger = await request.get("/vehiculo/ford-ranger-4x4-2023-shyl53", { maxRedirects: 0 });
    expect(ranger.status()).toBe(301);
    expect(ranger.headers().location || "").toContain("/vehiculo/ford-ranger-4x4-rojo-2023-7cm3a8");
    const tracker = await request.get("/vehiculo/chevrolet-tracker-mt-2022-rzkv76", { maxRedirects: 0 });
    expect(tracker.status()).toBe(301);
    expect(tracker.headers().location || "").not.toContain("unidadeschile");
    expect(tracker.headers().location || "").not.toContain("salgado");
    const tucson = await request.get("/vehiculo/hyundai-tucson-gl-2-0-2014-ghtd24", { maxRedirects: 0 });
    expect(tucson.status()).toBe(410);
  });

  test("axe sin violaciones serias en catálogo y ficha", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/catalogo");
    const catalog = await new AxeBuilder({ page }).analyze();
    const serious = (violations: { impact?: string | null }[]) =>
      violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(serious(catalog.violations)).toEqual([]);
    await openFirstVehicle(page);
    const detail = await new AxeBuilder({ page }).analyze();
    expect(serious(detail.violations)).toEqual([]);
  });
});
