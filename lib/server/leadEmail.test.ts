import { describe, expect, it } from "vitest";
import { teamEmail, visitorEmail, waNumber, isValidEmail, formatSantiago } from "./leadEmail";
import { RG_EMAIL_BRAND } from "./emailBrand";

const when = new Date("2026-10-03T00:43:00Z");
const evil = `<img src=x onerror=alert(1)>"'&`;

describe("plantillas de leads", () => {
  it("escapa todo lo del visitante en HTML (contacto)", () => {
    const m = teamEmail(RG_EMAIL_BRAND, { kind: "contact", name: evil, email: "a@b.cl", phone: "912345678", message: evil, receivedAt: when });
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;");
    expect(m.subject).toBe(`Nuevo contacto web — ${evil}`);
    expect(m.html).toContain("https://wa.me/56912345678?text=");
    expect(m.html).toContain("mailto:a@b.cl?subject=");
    expect(m.html).toContain("https://www.rgmotorschile.cl/email/rg-logo.png");
    expect(m.text).toContain("Mensaje: <img");
  });

  it("consigna: asunto con el vehículo y hora de Chile", () => {
    const m = teamEmail(RG_EMAIL_BRAND, {
      kind: "consigna", name: "Juan\r\nBcc: x@y.cl", email: "", phone: "", vehicle: { brand: "Toyota", model: "Hilux", year: 2020, km: 85000 }, receivedAt: when,
    });
    expect(m.subject).toBe("Nueva consigna — Toyota Hilux 2020 · Juan Bcc: x@y.cl");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.html).toContain("85.000 km");
    expect(m.html).toContain("21:43");
    expect(m.html).not.toContain("mailto:");
    expect(m.html).not.toContain("Escribir por WhatsApp");
  });

  it("confirmación al visitante no repite su correo y trae contacto de la empresa", () => {
    const m = visitorEmail(RG_EMAIL_BRAND, { kind: "contact", name: "Ana", email: "ana@x.cl", phone: "+56 9 1111 2222", message: "Hola" });
    expect(m.subject).toBe("Recibimos tu mensaje — RG Motors");
    expect(m.html).not.toContain("ana@x.cl");
    expect(m.html).toContain(`https://wa.me/${RG_EMAIL_BRAND.whatsapp}`);
    expect(m.text).toContain("Próximos pasos");
  });

  it("utilidades", () => {
    expect(waNumber("9 8765 4321")).toBe("56987654321");
    expect(waNumber("+56 9 8765 4321")).toBe("56987654321");
    expect(waNumber("123")).toBe("");
    expect(isValidEmail("a@b.cl")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("<a@b.cl>")).toBe(false);
    expect(formatSantiago(when)).toMatch(/2 de octubre de 2026.*21:43/);
  });
});
