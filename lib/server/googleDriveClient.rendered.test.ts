import { describe, expect, it, vi } from "vitest";
import { downloadDriveRenderedJpeg } from "./googleDriveClient";

function jpegBytes(): ArrayBuffer {
  const buf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(900)]);
  return Uint8Array.from(buf).buffer;
}

describe("downloadDriveRenderedJpeg", () => {
  it("usa el thumbnail a s2000 sin bajar el HEIC original", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => jpegBytes(),
    }));

    const out = await downloadDriveRenderedJpeg(
      "heic-1",
      "https://lh3.googleusercontent.com/d/heic-1=s220",
      {
        getToken: async () => "token",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );

    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "https://lh3.googleusercontent.com/d/heic-1=s2000",
    );
    expect(fetchImpl.mock.calls[0][1]).toBeUndefined();
  });

  it("reintenta con Bearer si el thumbnail está restringido", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => jpegBytes(),
      });

    const out = await downloadDriveRenderedJpeg("dng-1", undefined, {
      getToken: async () => "token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(out.length).toBeGreaterThan(800);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondInit = fetchImpl.mock.calls[1][1] as RequestInit;
    expect(secondInit.headers).toEqual({ Authorization: "Bearer token" });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("lh3.googleusercontent.com");
  });
});
