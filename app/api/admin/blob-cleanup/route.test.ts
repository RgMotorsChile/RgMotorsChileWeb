// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from "vitest";

const state = { admin: true };
const del = vi.fn();
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdminSession: async () => state.admin }));
vi.mock("@/lib/server/storageHealth", () => ({ isBlobReady: () => true }));
vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/server/blobCleanup", async () => {
  const core = await import("@/lib/server/blobCleanupCore");
  const cands = [
    { url: "u1", pathname: "cars/uploads/x/1.jpg", size: 10, uploadedAt: "", category: "vendidos", slug: "x", reason: "" },
    { url: "u2", pathname: "cars/uploads/y/2.jpg", size: 20, uploadedAt: "", category: "antiguos", slug: "y", reason: "" },
  ];
  return {
    CleanupAbort: class extends Error {},
    computeCleanupPlan: async () => ({
      candidates: cands,
      totals: { blobs: 2, bytes: 30 },
      byCategory: core.summarize(cands as never),
      protectedCounts: {},
    }),
    pickCategories: (c: typeof cands, cats: string[]) => c.filter((x) => cats.includes(x.category)),
    deleteCandidates: async (sel: typeof cands) => {
      del(sel.map((s) => s.url));
      return { deleted: sel.length, bytes: sel.reduce((s, x) => s + x.size, 0) };
    },
    getCleanupLog: async () => [],
  };
});

import { GET, POST } from "./route";
import { selectionFingerprint } from "@/lib/server/blobCleanupCore";
import { NextRequest } from "next/server";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://x/api/admin/blob-cleanup", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });

describe("/api/admin/blob-cleanup", () => {
  beforeEach(() => {
    state.admin = true;
    del.mockClear();
  });
  it("401 sin sesión de admin (GET y POST)", async () => {
    state.admin = false;
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { categories: ["vendidos"], fingerprint: "x", confirm: "BORRAR" }))).status).toBe(401);
    expect(del).not.toHaveBeenCalled();
  });
  it("GET solo muestra la vista previa", async () => {
    const j = await (await GET(req("GET"))).json();
    expect(j.byCategory.vendidos.count).toBe(1);
    expect(del).not.toHaveBeenCalled();
  });
  it("POST sin confirmación no borra", async () => {
    expect((await POST(req("POST", { categories: ["vendidos"], fingerprint: "x" }))).status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });
  it("POST con lista distinta a la vista previa no borra", async () => {
    const r = await POST(req("POST", { categories: ["vendidos"], fingerprint: "otra", confirm: "BORRAR" }));
    expect(r.status).toBe(409);
    expect(del).not.toHaveBeenCalled();
  });
  it("POST confirmado borra solo la categoría elegida", async () => {
    const fp = selectionFingerprint([
      { url: "u1", pathname: "cars/uploads/x/1.jpg", size: 10, uploadedAt: "", category: "vendidos", slug: "x", reason: "" },
    ]);
    const r = await POST(req("POST", { categories: ["vendidos"], fingerprint: fp, confirm: "BORRAR" }));
    expect(r.status).toBe(200);
    expect(del).toHaveBeenCalledWith(["u1"]);
  });
});
