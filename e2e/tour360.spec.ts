import { test, expect, type Page } from "@playwright/test";

/** Tour 360: arrastre lineal + inercia corta, Auto-Giro, botones de ángulo, zoom y móvil. */
const URL = "/tour-360-demo";

async function ready(page: Page) {
  await page.goto(URL);
  const canvas = page.getByTestId("spin360-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByText("CARGANDO 360°")).toBeHidden({ timeout: 60_000 });
  return canvas;
}
const frame = async (page: Page) => Number(await page.getByTestId("spin360-canvas").getAttribute("data-frame"));
const total = async (page: Page) => Number((await page.getByTestId("spin360-counter").textContent())!.split("/")[1]);
const circ = (a: number, b: number, n: number) => Math.min((a - b + n) % n, (b - a + n) % n);

async function drag(page: Page, dxFrac: number, pointerType: "mouse" | "touch" = "mouse") {
  const c = page.getByTestId("spin360-canvas");
  const bb = (await c.boundingBox())!;
  const y = bb.y + bb.height / 2;
  const x0 = bb.x + bb.width * 0.75;
  const steps = 24;
  const ev = (type: string, x: number) =>
    c.dispatchEvent(type, { pointerId: 7, pointerType, isPrimary: true, clientX: x, clientY: y, buttons: type === "pointerup" ? 0 : 1 });
  await ev("pointerdown", x0);
  for (let s = 1; s <= steps; s++) {
    await ev("pointermove", x0 - bb.width * dxFrac * (s / steps));
    await page.waitForTimeout(25); // arrastre lento: sin inercia
  }
  await page.waitForTimeout(150);
  await ev("pointerup", x0 - bb.width * dxFrac);
}

test.describe("Tour 360", () => {
  test("arrastre lineal: medio ancho ≈ media vuelta y la inercia termina antes de 400 ms", async ({ page }) => {
    await ready(page);
    const n = await total(page);
    await page.getByTestId("spin360-goto-0").click(); // pausa Auto-Giro y va al frente
    await page.waitForTimeout(700);
    const f0 = await frame(page);
    await drag(page, 0.5);
    await page.waitForTimeout(400);
    const f1 = await frame(page);
    await page.waitForTimeout(500);
    expect(await frame(page)).toBe(f1); // detenido
    expect(Math.abs(circ(f1, f0, n) - n / 2)).toBeLessThanOrEqual(Math.ceil(n * 0.06));
  });

  test("Auto-Giro ≈ 10–12 s por vuelta y se pausa al interactuar", async ({ page }) => {
    await ready(page);
    const n = await total(page);
    await page.getByTestId("spin360-goto-0").click();
    await page.waitForTimeout(700);
    await page.getByTestId("spin360-auto").click();
    await page.waitForTimeout(1200); // tras el easing de arranque
    const a = await frame(page);
    const t0 = Date.now();
    await page.waitForTimeout(3000);
    const b = await frame(page);
    const secsPerTurn = ((Date.now() - t0) / 1000) * (n / ((b - a + n) % n));
    expect(secsPerTurn).toBeGreaterThan(9);
    expect(secsPerTurn).toBeLessThan(13.5);
    await drag(page, 0.05);
    const p = await frame(page);
    await page.waitForTimeout(1200);
    expect(await frame(page)).toBe(p);
    await expect(page.getByTestId("spin360-auto")).toHaveAttribute("aria-pressed", "false");
  });

  test("botones de ángulo: llegan en < 600 ms por el camino más corto con contador correcto", async ({ page }) => {
    await ready(page);
    const n = await total(page);
    await page.getByTestId("spin360-goto-0").click();
    await page.waitForTimeout(700);
    for (const [k, expected] of [[2, n / 2], [3, (3 * n) / 4], [0, 0], [1, n / 4]] as const) {
      const seen: number[] = [];
      const t0 = Date.now();
      await page.getByTestId(`spin360-goto-${k}`).click();
      while (Date.now() - t0 < 600) {
        seen.push(await frame(page));
        await page.waitForTimeout(30);
      }
      expect(await frame(page)).toBe(Math.round(expected) % n);
      await expect(page.getByTestId("spin360-counter")).toHaveText(`${(Math.round(expected) % n) + 1}/${n}`);
      // camino más corto: nunca se aleja más de media vuelta del destino
      for (const f of seen) expect(circ(f, Math.round(expected) % n, n)).toBeLessThanOrEqual(n / 2);
    }
  });

  test("zoom: no pierde el ángulo y carga alta resolución", async ({ page }) => {
    await ready(page);
    await page.getByTestId("spin360-goto-1").click();
    await page.waitForTimeout(700);
    const f = await frame(page);
    const hi = page.waitForRequest((r) => /\/hi\/\d{3}\.webp/.test(r.url()), { timeout: 5000 });
    await page.getByTestId("spin360-zoom").click();
    await hi;
    await page.waitForTimeout(400);
    expect(await frame(page)).toBe(f);
    await page.getByTestId("spin360-zoom").click();
    expect(await frame(page)).toBe(f);
  });

  test.describe("móvil", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test("arrastre táctil igual que el mouse", async ({ page }) => {
      await ready(page);
      const n = await total(page);
      await page.getByTestId("spin360-goto-0").click();
      await page.waitForTimeout(700);
      const f0 = await frame(page);
      await drag(page, 0.25, "touch");
      await page.waitForTimeout(400);
      expect(Math.abs(circ(await frame(page), f0, n) - n / 4)).toBeLessThanOrEqual(Math.ceil(n * 0.06));
    });
  });
});
