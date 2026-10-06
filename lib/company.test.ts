import { describe, expect, it } from "vitest";
import { COMPANY, whatsappLink } from "@/lib/company";

describe("company config", () => {
  it("tiene datos de contacto de Puerto Montt", () => {
    expect(COMPANY.name).toMatch(/RG Motors/i);
    expect(COMPANY.whatsapp).toMatch(/^56\d+$/);
    expect(COMPANY.email).toContain("@");
    expect(COMPANY.address.toLowerCase()).toContain("puerto montt");
  });

  it("arma link de WhatsApp", () => {
    const url = whatsappLink("Hola RG");
    expect(url).toContain("wa.me/");
    expect(url).toContain(COMPANY.whatsapp);
  });
});
