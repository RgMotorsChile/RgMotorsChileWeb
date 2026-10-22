import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdminSession = vi.hoisted(() => vi.fn(async () => true));
const saveVehicle = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdminSession }));
vi.mock("@/lib/server/vehiclesStore", () => ({
  getVehicleBySlug: vi.fn(async () => ({ slug: "hilux-2020", image: "/a.jpg", gallery: [] })),
  saveVehicle,
}));

import { POST } from "./route";

describe("POST /api/photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSession.mockResolvedValue(true);
  });

  it("rechaza type=spin y no guarda el vehículo", async () => {
    const form = new FormData();
    form.set("slug", "hilux-2020");
    form.set("type", "spin");
    form.set("files", new File([Uint8Array.from([1, 2, 3, 4])], "001.webp", { type: "image/webp" }));
    const res = await POST(
      new NextRequest("https://www.rgmotorschile.cl/api/photos", { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/upload-urls/);
    expect(saveVehicle).not.toHaveBeenCalled();
  });
});
