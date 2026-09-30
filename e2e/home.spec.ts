import { test, expect } from "@playwright/test";

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

  test("simulador de crédito carga sin pasarela de pago", async ({ page }) => {
    await page.goto("/simulador");
    await expect(page.getByRole("main")).toContainText(/crédito|simul|cuota|pie|plazo/i);
    await expect(page.locator("body")).not.toContainText(/webpay|transbank/i);
  });

  test("páginas legales existen", async ({ page }) => {
    await page.goto("/privacidad");
    await expect(page.getByRole("main")).toContainText(/privacidad|datos|personal/i);

    await page.goto("/terminos");
    await expect(page.getByRole("main")).toContainText(/términos|condiciones|uso/i);

    await page.goto("/aviso-credito");
    await expect(page.getByRole("main")).toContainText(/crédito|aviso|autofin|sernac/i);
  });

  test("admin login es accesible; panel exige auth", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("body")).toContainText(/admin|usuario|contraseña|ingresar|acceso/i);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
