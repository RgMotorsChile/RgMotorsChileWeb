import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SPIN_PUT_ATTEMPTS,
  SPIN_UPLOAD_CONCURRENCY,
  prepareHdFrame,
  prepareStandardFrame,
  sortFramesByNumber,
  uploadSpinSets,
} from "@/lib/client/uploadSpin";

const bytes = new Uint8Array(64);

function frame(name: string, type: string): File {
  return new File([bytes], name, { type });
}

function numbered(count: number, ext: string, type: string): File[] {
  return Array.from({ length: count }, (_, index) =>
    frame(`${String(index + 1).padStart(3, "0")}.${ext}`, type),
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function signedPlan(count: number, withHd: boolean) {
  const uploads = (name: string, contentType: string) =>
    Array.from({ length: count }, (_, index) => ({
      index: index + 1,
      path: `rg-motors/hilux/spin/v1/${name}/${String(index + 1).padStart(3, "0")}`,
      signedUrl: `https://sign.test/${name}/${index + 1}`,
      contentType,
    }));
  return {
    sets: [
      { name: "m900", ext: "webp", count, uploads: uploads("m900", "image/webp") },
      ...(withHd
        ? [{ name: "d1600", ext: "avif", count, uploads: uploads("d1600", "image/avif") }]
        : []),
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fotogramas del giro", () => {
  it("ordena por número y no recomprime WebP ni AVIF", async () => {
    const ordered = sortFramesByNumber([
      frame("010.webp", "image/webp"),
      frame("2.webp", "image/webp"),
      frame("001.webp", "image/webp"),
    ]);
    expect(ordered.map((file) => file.name)).toEqual(["001.webp", "2.webp", "010.webp"]);

    const webp = frame("001.webp", "image/webp");
    const avif = frame("001.avif", "image/avif");
    expect((await prepareStandardFrame(webp)).file).toBe(webp);
    expect((await prepareHdFrame(avif)).file).toBe(avif);
    expect((await prepareHdFrame(webp)).file).toBe(webp);
    await expect(prepareHdFrame(frame("001.jpg", "image/jpeg"))).rejects.toThrow(/HD/);
  });

  it("sube de a 6, reintenta, no recomprime la HD y solo al final confirma", async () => {
    const standard = numbered(24, "webp", "image/webp");
    const hd = numbered(24, "avif", "image/avif");
    let inFlight = 0;
    let maxInFlight = 0;
    let commits = 0;
    const bodies: unknown[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attempts = new Map<string, number>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/spin/upload-urls")) return json(signedPlan(24, true));
        if (url.includes("/api/spin/commit")) {
          commits += 1;
          const payload = JSON.parse(String(init?.body));
          expect(payload.sets).toEqual([
            { name: "m900", ext: "webp", count: 24 },
            { name: "d1600", ext: "avif", count: 24 },
          ]);
          return json({ success: true });
        }
        const count = (attempts.get(url) ?? 0) + 1;
        attempts.set(url, count);
        if (count < SPIN_PUT_ATTEMPTS) return new Response("no", { status: 503 });
        bodies.push(init?.body);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (inFlight < SPIN_UPLOAD_CONCURRENCY) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        await gate;
        inFlight -= 1;
        return new Response(null, { status: 200 });
      }),
    );

    const pending = uploadSpinSets({
      slug: "hilux-2020",
      standard,
      hd,
      retryDelayMs: 0,
    });
    try {
      await vi.waitFor(() => {
        expect(maxInFlight).toBe(SPIN_UPLOAD_CONCURRENCY);
      });
      expect(commits).toBe(0);
      expect([...attempts.values()].some((count) => count >= SPIN_PUT_ATTEMPTS)).toBe(true);
    } finally {
      release();
    }
    await pending;
    expect(commits).toBe(1);
    expect(bodies).toContain(standard[0]);
    expect(bodies).toContain(hd[0]);
  });

  it("no confirma si la subida sigue fallando", async () => {
    const standard = numbered(24, "webp", "image/webp");
    const bodies: unknown[] = [];
    let commits = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/spin/upload-urls")) return json(signedPlan(24, false));
        if (url.includes("/api/spin/commit")) {
          commits += 1;
          return json({ error: "no" }, 500);
        }
        bodies.push(init?.body);
        return new Response("no", { status: 500 });
      }),
    );

    await expect(
      uploadSpinSets({ slug: "hilux-2020", standard, retryDelayMs: 0 }),
    ).rejects.toThrow(/fotograma/);
    expect(commits).toBe(0);
    expect(bodies.filter((body) => body === standard[0])).toHaveLength(SPIN_PUT_ATTEMPTS);
  });
});
