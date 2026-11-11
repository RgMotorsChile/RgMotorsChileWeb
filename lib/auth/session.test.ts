import { describe, expect, it } from "vitest";
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/lib/auth/session";

describe("admin session tokens", () => {
  it("crea y verifica un token válido", async () => {
    const token = await createAdminSessionToken("mathias", false);
    const payload = await verifyAdminSessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("mathias");
    expect(payload?.mustChange).toBe(false);
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("respeta mustChange en el payload", async () => {
    const token = await createAdminSessionToken("admin", true);
    const payload = await verifyAdminSessionToken(token);
    expect(payload?.mustChange).toBe(true);
  });

  it("rechaza token vacío, malformado o firmado mal", async () => {
    expect(await verifyAdminSessionToken(null)).toBeNull();
    expect(await verifyAdminSessionToken("")).toBeNull();
    expect(await verifyAdminSessionToken("sin-punto")).toBeNull();

    const token = await createAdminSessionToken("u", false);
    const [body] = token.split(".");
    expect(await verifyAdminSessionToken(`${body}.firma-falsa`)).toBeNull();
  });

  it("rechaza payload manipulado manteniendo firma vieja", async () => {
    const token = await createAdminSessionToken("u", false);
    const [, signature] = token.split(".");
    const fakeBody = btoa(JSON.stringify({ sub: "hacker", mustChange: false, iat: 1, exp: 9999999999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyAdminSessionToken(`${fakeBody}.${signature}`)).toBeNull();
  });

  it("incluye role admin en tokens nuevos", async () => {
    const token = await createAdminSessionToken("rg.mathias", false);
    const payload = await verifyAdminSessionToken(token);
    expect(payload?.role).toBe("admin");
    expect(payload?.sub).toBe("rg.mathias");
  });
});
