import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runPhotosResyncBatch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/machineAuth", () => ({
  authorizeMachineSecret: (req: Request) =>
    (req.headers.get("authorization") || "") === "Bearer test-cron-secret-16chars",
}));

vi.mock("@/lib/server/photosResync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/photosResync")>(
    "@/lib/server/photosResync",
  );
  return { ...actual, runPhotosResyncBatch };
});

import { GET, POST } from "./route";

function call(url: string, auth = true, method: "GET" | "POST" = "GET") {
  const req = new NextRequest(url, {
    method,
    headers: auth ? { authorization: "Bearer test-cron-secret-16chars" } : {},
  });
  return method === "POST" ? POST(req) : GET(req);
}

describe("/api/cron/photos-resync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runPhotosResyncBatch.mockResolvedValue({
      ok: true,
      done: false,
      tenant: "rg-motors",
      cursor: "rg-motors",
      nextCursor: "rg-motors:alfa",
      limit: 2,
      pending: 3,
      batch: ["alfa"],
      syncedVehicles: 1,
      newPhotosDownloaded: 4,
      deferredVehicles: 0,
      message: "ok",
    });
  });

  it("exige el mismo Bearer CRON_SECRET", async () => {
    const denied = await call("https://www.rgmotorschile.cl/api/cron/photos-resync", false);
    expect(denied.status).toBe(401);
    expect(runPhotosResyncBatch).not.toHaveBeenCalled();
  });

  it("rechaza un limit inválido", async () => {
    const res = await call("https://www.rgmotorschile.cl/api/cron/photos-resync?limit=20");
    expect(res.status).toBe(400);
    expect(runPhotosResyncBatch).not.toHaveBeenCalled();
  });

  it("corre un lote y devuelve el cursor siguiente", async () => {
    const res = await call(
      "https://www.rgmotorschile.cl/api/cron/photos-resync?tenant=rg-motors&cursor=rg-motors&limit=2",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextCursor).toBe("rg-motors:alfa");
    expect(runPhotosResyncBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: "rg-motors",
        tenant: "rg-motors",
        limit: 2,
        deadlineAt: expect.any(Number),
      }),
    );
  });

  it("POST usa la misma autenticación", async () => {
    const res = await call("https://www.rgmotorschile.cl/api/cron/photos-resync", true, "POST");
    expect(res.status).toBe(200);
    expect(runPhotosResyncBatch).toHaveBeenCalled();
  });
});
