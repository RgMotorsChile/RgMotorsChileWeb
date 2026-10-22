import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SPIN_PUT_ATTEMPTS,
  SPIN_UPLOAD_CONCURRENCY,
  createSpinVersion,
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
    let aborts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/spin/abort")) {
          aborts += 1;
          const payload = JSON.parse(String(init?.body));
          expect(payload.version).toMatch(/^[a-z0-9]+$/);
          return json({ success: true, deleted: 0 });
        }
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
    expect(aborts).toBe(1);
    expect(bodies.filter((body) => body === standard[0])).toHaveLength(SPIN_PUT_ATTEMPTS);
  });

  it("firma por lotes con una sola versión y no borra si el giro se confirma", async () => {
    const standard = numbered(24, "webp", "image/webp");
    const versions: string[] = [];
    const ranges: Array<[number, number]> = [];
    let aborts = 0;
    let commits = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/spin/abort")) {
          aborts += 1;
          return json({ deleted: 0 });
        }
        if (url.includes("/api/spin/upload-urls")) {
          const payload = JSON.parse(String(init?.body)) as {
            version: string;
            sets: Array<{ from: number; to: number; count: number }>;
          };
          versions.push(payload.version);
          const set = payload.sets[0]!;
          ranges.push([set.from, set.to]);
          const uploads = [];
          for (let index = set.from; index <= set.to; index += 1) {
            uploads.push({
              index,
              signedUrl: `https://sign.test/${index}`,
              contentType: "image/webp",
              path: `p/${index}`,
            });
          }
          return json({
            version: payload.version,
            sets: [{ name: "m900", ext: "webp", count: set.count, uploads }],
          });
        }
        if (url.includes("/api/spin/commit")) {
          commits += 1;
          const payload = JSON.parse(String(init?.body)) as { version: string };
          expect(payload.version).toBe(versions[0]);
          return json({ success: true });
        }
        return new Response(null, { status: 200 });
      }),
    );

    await uploadSpinSets({
      slug: "hilux-2020",
      standard,
      signBatchSize: 8,
      retryDelayMs: 0,
    });
    expect(ranges).toEqual([
      [1, 8],
      [9, 16],
      [17, 24],
    ]);
    expect(new Set(versions).size).toBe(1);
    expect(commits).toBe(1);
    expect(aborts).toBe(0);
  });

  it("si firmar no responde, muestra el tiempo agotado y borra esa versión", async () => {
    const standard = numbered(24, "webp", "image/webp");
    let abortVersion = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/spin/abort")) {
          abortVersion = JSON.parse(String(init?.body)).version;
          return json({ success: true, deleted: 4 });
        }
        if (url.includes("/api/spin/upload-urls")) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          });
        }
        throw new Error("no debía subir ni confirmar");
      }),
    );

    await expect(
      uploadSpinSets({
        slug: "hilux-2020",
        standard,
        signTimeoutMs: 30,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Se agotó el tiempo al firmar las subidas/);
    expect(abortVersion).toMatch(/^[a-z0-9]+$/);
  });

  it("cada intento pide una versión distinta", async () => {
    const versions: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/spin/abort")) return json({ deleted: 0 });
        if (url.includes("/api/spin/upload-urls")) {
          versions.push(JSON.parse(String(init?.body)).version);
          return json({ error: "rechazado" }, 400);
        }
        throw new Error("no debía subir");
      }),
    );
    const standard = numbered(24, "webp", "image/webp");
    await expect(uploadSpinSets({ slug: "hilux-2020", standard })).rejects.toThrow(/rechazado/);
    await expect(uploadSpinSets({ slug: "hilux-2020", standard })).rejects.toThrow(/rechazado/);
    expect(versions).toHaveLength(2);
    expect(versions[0]).not.toBe(versions[1]);
    expect(versions[0]).not.toBe(createSpinVersion());
  });

  it("simula 284 fotogramas: lotes en serie, reintenta el pool y confirma una sola vez", async () => {
    const standard = numbered(142, "webp", "image/webp");
    const hd = numbered(142, "avif", "image/avif");
    let inFlight = 0;
    let maxInFlight = 0;
    let signedFrames = 0;
    let puts = 0;
    let commits = 0;
    let aborts = 0;
    const attempts = new Map<string, number>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/spin/abort")) {
          aborts += 1;
          return json({ deleted: 0 });
        }
        if (url.includes("/api/spin/commit")) {
          commits += 1;
          const payload = JSON.parse(String(init?.body)) as {
            version: string;
            sets: Array<{ name: string; ext: string; count: number }>;
          };
          expect(payload.sets).toEqual([
            { name: "m900", ext: "webp", count: 142 },
            { name: "d1600", ext: "avif", count: 142 },
          ]);
          return json({ success: true });
        }
        if (url.includes("/api/spin/upload-urls")) {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          try {
            const payload = JSON.parse(String(init?.body)) as {
              version: string;
              sets: Array<{ name: string; ext: string; count: number; from: number; to: number }>;
            };
            expect(payload.sets).toHaveLength(1);
            const set = payload.sets[0]!;
            const key = `${set.name}:${set.from}-${set.to}`;
            const n = (attempts.get(key) ?? 0) + 1;
            attempts.set(key, n);
            if (set.name === "m900" && set.from === 97 && n === 1) {
              return json({ error: "Too many connections issued to the database" }, 500);
            }
            const uploads = [];
            for (let index = set.from; index <= set.to; index += 1) {
              uploads.push({
                index,
                signedUrl: `https://sign.test/${set.name}/${index}`,
                contentType: set.ext === "avif" ? "image/avif" : "image/webp",
                path: `p/${set.name}/${index}`,
              });
            }
            signedFrames += set.to - set.from + 1;
            return json({
              version: payload.version,
              sets: [{ name: set.name, ext: set.ext, count: set.count, uploads }],
            });
          } finally {
            inFlight -= 1;
          }
        }
        puts += 1;
        return new Response(null, { status: 200 });
      }),
    );

    const progress: string[] = [];
    await uploadSpinSets({
      slug: "ford-edge-2017-jrth26",
      standard,
      hd,
      signBatchSize: 24,
      retryDelayMs: 0,
      onProgress: (done, total, phase) => progress.push(`${phase ?? "upload"} ${done}/${total}`),
    });

    expect(maxInFlight).toBe(1);
    expect(signedFrames).toBe(284);
    expect(puts).toBe(284);
    expect(commits).toBe(1);
    expect(aborts).toBe(0);
    expect(attempts.get("m900:97-120")).toBe(2);
    expect(progress).toContain("sign 192/284");
    expect(progress.at(-1)).toBe("upload 284/284");
  });

  it("si el pool sigue lleno, no confirma y borra el intento", async () => {
    const standard = numbered(24, "webp", "image/webp");
    let signs = 0;
    let commits = 0;
    let aborts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/spin/abort")) {
          aborts += 1;
          return json({ success: true, deleted: 4 });
        }
        if (url.includes("/api/spin/commit")) {
          commits += 1;
          return json({ success: true });
        }
        if (url.includes("/api/spin/upload-urls")) {
          signs += 1;
          return json({ error: "Too many connections issued to the database" }, 503);
        }
        throw new Error("no debía subir");
      }),
    );

    await expect(
      uploadSpinSets({ slug: "ford-edge-2017-jrth26", standard, retryDelayMs: 0 }),
    ).rejects.toThrow(/Too many connections issued to the database/);
    expect(signs).toBe(4);
    expect(commits).toBe(0);
    expect(aborts).toBe(1);
  });
});
