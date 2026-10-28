import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const syncFromLiveGoogleSheet = vi.hoisted(() => vi.fn());
const syncDrivePhotosViaOAuth = vi.hoisted(() => vi.fn());
const runAutoSync = vi.hoisted(() => vi.fn());
const recordCatalogSyncState = vi.hoisted(() => vi.fn());
const getAutoSyncStatus = vi.hoisted(() => vi.fn(() => ({ isSyncing: false })));
const isGoogleDriveOAuthConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/server/googleSheetSyncService", () => ({
  syncFromLiveGoogleSheet,
}));

vi.mock("@/lib/server/driveOAuthSyncService", () => ({
  syncDrivePhotosViaOAuth,
  MAX_NEW_PHOTOS_PER_RUN: 36,
}));

vi.mock("@/lib/server/autoSyncScheduler", () => ({
  runAutoSync,
  getAutoSyncStatus,
}));

vi.mock("@/lib/server/googleDriveClient", () => ({
  isGoogleDriveOAuthConfigured,
}));

vi.mock("@/lib/server/syncStateStore", () => ({
  recordCatalogSyncState,
}));

vi.mock("@/lib/auth/machineAuth", () => ({
  authorizeMachineSecret: (req: Request) =>
    (req.headers.get("authorization") || "") === "Bearer test-cron-secret-16chars",
}));

import { GET, POST } from "./route";

const sheetOk = {
  success: true,
  message: "ok",
  rowsRead: 12,
  newVehicles: 1,
  updatedVehicles: 2,
  skippedIncomplete: 3,
};

const driveOk = {
  success: true,
  message: "fotos",
  newPhotosDownloaded: 4,
  syncedVehicles: 1,
  skippedUnchanged: 5,
  skippedCoverLocked: 1,
};

function call(url: string, auth = true) {
  return GET(
    new NextRequest(url, {
      headers: auth
        ? { authorization: "Bearer test-cron-secret-16chars" }
        : {},
    }),
  );
}

describe("GET /api/cron/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T11:05:00.000Z"));
    isGoogleDriveOAuthConfigured.mockReturnValue(true);
    syncFromLiveGoogleSheet.mockResolvedValue(sheetOk);
    syncDrivePhotosViaOAuth.mockResolvedValue(driveOk);
    runAutoSync.mockResolvedValue(driveOk);
    recordCatalogSyncState.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exige Bearer", async () => {
    const res = await call("https://rgmotorschile.cl/api/cron/sync", false);
    expect(res.status).toBe(401);
    expect(recordCatalogSyncState).not.toHaveBeenCalled();
  });

  it("usa el tenant explícito y no el reloj", async () => {
    vi.setSystemTime(new Date("2026-10-15T11:05:00.000Z"));
    const res = await call(
      "https://rgmotorschile.cl/api/cron/sync?tenant=unidades-chile",
    );
    expect(res.status).toBe(200);
    expect(syncFromLiveGoogleSheet).toHaveBeenCalledWith(undefined, {
      tenantSlug: "unidades-chile",
    });
    expect(syncDrivePhotosViaOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: "unidades-chile",
        maxNewPhotos: 36,
      }),
    );
    expect(runAutoSync).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.tenant).toBe("unidades-chile");
    expect(body).toEqual({
      success: true,
      tenant: "unidades-chile",
      read: 12,
      inserted: 1,
      updated: 3,
      sold: 0,
      skipped: 9,
      errors: [],
    });
    expect(recordCatalogSyncState).toHaveBeenCalledWith(
      "unidades-chile",
      expect.objectContaining({
        tenant: "unidades-chile",
        read: 12,
        inserted: 1,
        updated: 3,
        skipped: 9,
        photos: 4,
        errors: [],
        success: true,
      }),
    );
  });

  it("sin parámetro, 12 UTC sigue siendo Unidades Chile", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    const res = await call("https://rgmotorschile.cl/api/cron/sync");
    expect(res.status).toBe(200);
    expect(syncDrivePhotosViaOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSlug: "unidades-chile" }),
    );
  });

  it("sin parámetro, fuera de las 12 UTC sincroniza RG", async () => {
    const res = await call("https://rgmotorschile.cl/api/cron/sync");
    expect(res.status).toBe(200);
    expect(runAutoSync).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSlug: "rg-motors", maxNewPhotos: 36 }),
    );
    expect(syncDrivePhotosViaOAuth).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.tenant).toBe("rg-motors");
  });

  it("rechaza un tenant desconocido sin escribir sync_state", async () => {
    const res = await call("https://rgmotorschile.cl/api/cron/sync?tenant=otro");
    expect(res.status).toBe(400);
    expect(syncFromLiveGoogleSheet).not.toHaveBeenCalled();
    expect(recordCatalogSyncState).not.toHaveBeenCalled();
  });

  it("escribe sync_state aunque la corrida lance", async () => {
    syncFromLiveGoogleSheet.mockRejectedValue(new Error("sheets caídos"));
    const res = await POST(
      new NextRequest("https://rgmotorschile.cl/api/cron/sync?tenant=rg-motors", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret-16chars" },
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toContain("sheets caídos");
    expect(body.syncState).toBeUndefined();
    expect(body.sheetSync).toBeUndefined();
    expect(body.driveSync).toBeUndefined();
    expect(recordCatalogSyncState).toHaveBeenCalledWith(
      "rg-motors",
      expect.objectContaining({
        success: false,
        errors: ["sheets caídos"],
        photos: 0,
      }),
    );
  });

  it("responde 500 si la planilla falla, y igual persiste el detalle", async () => {
    syncFromLiveGoogleSheet.mockResolvedValue({
      success: false,
      message: "hoja restringida",
      rowsRead: 0,
      newVehicles: 0,
      updatedVehicles: 0,
      skippedIncomplete: 0,
      soldVehicles: 0,
      vehicles: [
        {
          plate: "KWRC91",
          supplier: "ARVAL RELSA",
          listPrice: 15490001,
          coverLocked: true,
        },
      ],
    });
    const res = await call(
      "https://rgmotorschile.cl/api/cron/sync?tenant=rg-motors",
    );
    expect(res.status).toBe(500);
    const failed = await res.json();
    expect(failed.success).toBe(false);
    expect(failed.errors).toContain("hoja restringida");
    expect(JSON.stringify(failed)).not.toContain("KWRC91");
    expect(JSON.stringify(failed)).not.toContain("ARVAL RELSA");
    expect(failed.vehicles).toBeUndefined();
    expect(recordCatalogSyncState).toHaveBeenCalledWith(
      "rg-motors",
      expect.objectContaining({
        success: false,
        errors: ["hoja restringida"],
      }),
    );
  });

  it("no devuelve patente, proveedor, precio lista ni portada bloqueada", async () => {
    const ficha = {
      plate: "KWRC91",
      supplier: "ARVAL RELSA",
      listPrice: 15490001,
      coverLocked: true,
      techReview: "REV-INTERNA",
      circPermit: "PERM-INTERNO",
      payload: { secret: "PAYLOAD-INTERNO" },
      owners: 3,
    };
    syncFromLiveGoogleSheet.mockResolvedValue({
      ...sheetOk,
      soldVehicles: 4,
      vehicles: [ficha],
      changes: [{ ...ficha, supplier: "PROVEEDOR-GAMA" }],
    });
    syncDrivePhotosViaOAuth.mockResolvedValue({
      ...driveOk,
      vehicles: [{ ...ficha, plate: "PXSV97", supplier: "PROVEEDOR-GAMA" }],
      errors: ["No se listaron fotos de KWRC91: timeout", "HTTP 404 al bajar"],
    });
    const res = await call(
      "https://rgmotorschile.cl/api/cron/sync?tenant=unidades-chile",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "errors",
      "inserted",
      "read",
      "skipped",
      "sold",
      "success",
      "tenant",
      "updated",
    ]);
    expect(body).toEqual({
      success: true,
      tenant: "unidades-chile",
      read: 12,
      inserted: 1,
      updated: 3,
      sold: 4,
      skipped: 9,
      errors: [
        "No se listaron fotos de [patente]: timeout",
        "HTTP 404 al bajar",
      ],
    });
    expect(recordCatalogSyncState).toHaveBeenCalledWith(
      "unidades-chile",
      expect.objectContaining({
        errors: [
          "No se listaron fotos de KWRC91: timeout",
          "HTTP 404 al bajar",
        ],
      }),
    );
    const dumped = JSON.stringify(body);
    for (const secret of [
      "KWRC91",
      "PXSV97",
      "ARVAL RELSA",
      "PROVEEDOR-GAMA",
      "15490001",
      "REV-INTERNA",
      "PERM-INTERNO",
      "PAYLOAD-INTERNO",
      "coverLocked",
      "listPrice",
      "supplier",
      "\"plate\"",
    ]) {
      expect(dumped).not.toContain(secret);
    }
  });

  it("status=1 no dispara el sync", async () => {
    const res = await call("https://rgmotorschile.cl/api/cron/sync?status=1");
    expect(res.status).toBe(200);
    expect(syncFromLiveGoogleSheet).not.toHaveBeenCalled();
    expect(recordCatalogSyncState).not.toHaveBeenCalled();
  });
});
