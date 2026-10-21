import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CODE_BLOB_REFS } from "./codeBlobRefs";
import { toPathname } from "./blobCleanupCore";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "lib", "components", "public", "scripts", "data"];
const SKIP = /node_modules|\.next|\.test\.|\.(jpe?g|png|webp|avif|gif|mp4|heic|ico|woff2?)$/i;
const BLOB_URL = /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^"'`\s)<>,\\]+/g;

function walk(dir: string, out: string[]) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.size < 2_000_000) out.push(p);
  }
}

describe("CODE_BLOB_REFS", () => {
  it("incluye toda URL de Blob escrita en código o public/", () => {
    const files: string[] = [];
    for (const d of DIRS) walk(join(ROOT, d), files);
    const listed = new Set(CODE_BLOB_REFS.map(toPathname));
    const missing: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.match(BLOB_URL) || []) {
        if (!listed.has(toPathname(m))) missing.push(`${f}: ${m}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
