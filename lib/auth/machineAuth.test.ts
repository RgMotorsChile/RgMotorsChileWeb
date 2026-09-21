import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  authorizeMachineSecret,
  isMachineAuthPath,
} from "@/lib/auth/machineAuth";

describe("machineAuth", () => {
  const prevCron = process.env.CRON_SECRET;
  const prevVercelEnv = process.env.VERCEL_ENV;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret-16chars";
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
  });

  afterEach(() => {
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  });

  it("detecta rutas máquina", () => {
    expect(isMachineAuthPath("/api/cron/sync")).toBe(true);
    expect(isMachineAuthPath("/api/webhooks/inventory-sync")).toBe(true);
    expect(isMachineAuthPath("/api/contact")).toBe(false);
  });

  it("acepta Bearer válido", () => {
    const req = new Request("http://localhost/api/cron/sync", {
      headers: { Authorization: "Bearer test-cron-secret-16chars" },
    });
    expect(authorizeMachineSecret(req, ["CRON_SECRET"])).toBe(true);
  });

  it("rechaza Bearer inválido en prod", () => {
    const req = new Request("http://localhost/api/cron/sync", {
      headers: { Authorization: "Bearer wrong-secret-xxxxxx" },
    });
    expect(authorizeMachineSecret(req, ["CRON_SECRET"])).toBe(false);
  });

  it("acepta header extra", () => {
    const req = new Request("http://localhost/api/webhooks/x", {
      headers: { "x-inventory-sync-secret": "test-cron-secret-16chars" },
    });
    expect(
      authorizeMachineSecret(req, ["CRON_SECRET"], {
        extraHeaderNames: ["x-inventory-sync-secret"],
      }),
    ).toBe(true);
  });
});
