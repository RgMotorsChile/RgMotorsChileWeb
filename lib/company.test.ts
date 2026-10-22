import { describe, expect, it } from "vitest";
import { COMPANY, whatsappLink } from "@/lib/company";

describe("company config", () => {
  it("tiene datos de contacto de Puerto Montt", () => {
    expect(COMPANY.name).toMatch(/RG Motors/i);
    expect(COMPANY.whatsapp).toBe("56959073127");
    expect(COMPANY.whatsapp).not.toBe("56973236636");
    expect(COMPANY.whatsapp).not.toBe("56994188305");
    expect(COMPANY.email).toContain("@");
    expect(COMPANY.address.toLowerCase()).toContain("puerto montt");
  });

  it("arma link de WhatsApp", () => {
    const url = whatsappLink("Hola RG");
    expect(url).toContain("wa.me/");
    expect(url).toContain(COMPANY.whatsapp);
  });
});
