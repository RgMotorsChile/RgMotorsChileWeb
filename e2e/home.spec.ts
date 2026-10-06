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

  test("simulador retirado: /simulador redirige al catálogo", async ({ page }) => {
    await page.goto("/simulador");
    await expect(page).toHaveURL(/\/catalogo$/);
    await expect(page.locator("body")).not.toContainText(/simula|preaprob|pre-aprob/i);
  });

  test("home y ficha sin rastros del simulador", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).not.toContainText(/simula|\/mes\b/i);
    await page.goto("/catalogo");
    const href = await page.locator('a[href^="/vehiculo/"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(page.getByRole("main")).not.toContainText(/simula|\/mes\b/i);
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
