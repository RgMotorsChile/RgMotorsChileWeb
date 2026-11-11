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

import { GET } from "./route";

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


  it("no corre la planilla ni Drive y responde desactivado", async () => {
    const res = await call("https://www.rgmotorschile.cl/api/cron/sync?tenant=rg-motors");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.disabled).toBe(true);
    expect(body.success).toBe(false);
    expect(syncFromLiveGoogleSheet).not.toHaveBeenCalled();
    expect(syncDrivePhotosViaOAuth).not.toHaveBeenCalled();
    expect(runAutoSync).not.toHaveBeenCalled();
    expect(recordCatalogSyncState).not.toHaveBeenCalled();
  });

  it("tampoco sincroniza el tenant de Unidades Chile", async () => {
    const res = await call("https://www.rgmotorschile.cl/api/cron/sync?tenant=unidades-chile");
    expect(res.status).toBe(409);
    expect(syncFromLiveGoogleSheet).not.toHaveBeenCalled();
    expect(syncDrivePhotosViaOAuth).not.toHaveBeenCalled();
    expect(runAutoSync).not.toHaveBeenCalled();
  });
});
