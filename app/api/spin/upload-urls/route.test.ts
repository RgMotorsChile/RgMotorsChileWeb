import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdminSession = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdminSession }));

import { POST as uploadUrls } from "./route";
import { POST as commit } from "../commit/route";
import { POST as abort } from "../abort/route";

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("rutas admin del giro", () => {
  beforeEach(() => {
    requireAdminSession.mockResolvedValue(true);
  });

  it("exige admin para firmar y para confirmar", async () => {
    requireAdminSession.mockResolvedValue(false);
    const deniedUpload = await uploadUrls(
      post("https://www.rgmotorschile.cl/api/spin/upload-urls", {}),
    );
    const deniedCommit = await commit(post("https://www.rgmotorschile.cl/api/spin/commit", {}));
    const deniedAbort = await abort(post("https://www.rgmotorschile.cl/api/spin/abort", {}));
    expect(deniedUpload.status).toBe(401);
    expect(deniedCommit.status).toBe(401);
    expect(deniedAbort.status).toBe(401);
  });

  it("no firma un set que no está permitido", async () => {
    const res = await uploadUrls(
      post("https://www.rgmotorschile.cl/api/spin/upload-urls", {
        slug: "hilux-2020",
        version: "ab12cd34",
        sets: [{ name: "full", ext: "jpg", count: 24 }],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/m900|d1600|extensión|set/i);
  });
});
