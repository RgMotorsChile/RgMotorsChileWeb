import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getVehicles } from "@/lib/server/vehiclesStore";
import { isPublicCatalogVehicle } from "@/lib/vehicles/publicCatalog";
import { slugMatchesVehicle } from "@/lib/vehicles/publicSlug";
import {
  generateCatalogPdfBuffer,
  isPdfSafeImagePath,
  type CatalogPdfImageMap,
} from "@/components/CatalogPdfDoc";
import type { Vehicle } from "@/lib/vehicles";
import { clientKey, rateLimitAsync } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function siteOrigin(req: NextRequest): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  if (envUrl) {
    return envUrl.startsWith("http") ? envUrl.replace(/\/$/, "") : `https://${envUrl.replace(/\/$/, "")}`;
  }
  return req.nextUrl.origin;
}

function publicUrl(origin: string, publicPath: string): string {
  if (/^https?:\/\//i.test(publicPath) || /^data:/i.test(publicPath)) return publicPath;
  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${origin}${path.split("?")[0]}`;
}

async function localFileToDataUri(publicPath: string): Promise<string | null> {
  if (!isPdfSafeImagePath(publicPath)) return null;
  const rel = publicPath.replace(/^\/+/, "").split("?")[0];
  const abs = join(process.cwd(), "public", rel);
  try {
    await access(abs);
    const buf = await readFile(abs);
    const ext = rel.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fetchUrlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "image/*,*/*" },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (ctype.includes("svg")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8_000) return null;
    const mime = ctype.startsWith("image/")
      ? ctype.split(";")[0]
      : url.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Disco local (dev) o fetch HTTP (Vercel: public/ no está en el bundle de la función). */
async function resolveImageDataUri(
  publicPath: string,
  origin: string,
): Promise<string | null> {
  if (!isPdfSafeImagePath(publicPath)) return null;
  const local = await localFileToDataUri(publicPath);
  if (local) return local;
  return fetchUrlToDataUri(publicUrl(origin, publicPath));
}

async function buildImageMap(
  vehicles: Vehicle[],
  origin: string,
): Promise<CatalogPdfImageMap> {
  const map: CatalogPdfImageMap = {};
  const logo = await resolveImageDataUri("/logo.png", origin);
  if (logo) map["__logo__"] = logo;

  // Limitar concurrencia para no saturar en catálogo completo
  const queue = [...vehicles];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const v = queue.shift();
      if (!v?.image) continue;
      const data = await resolveImageDataUri(v.image, origin);
      if (data) map[v.slug] = data;
    }
  });
  await Promise.all(workers);
  return map;
}

function parseSlugs(req: NextRequest): string[] | null {
  const q = req.nextUrl.searchParams.get("slugs");
  if (!q) return null;
  return q
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  try {
    const rl = await rateLimitAsync(clientKey(req, "catalog-pdf"), 3, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Demasiadas descargas de catálogo. Espera un minuto e intenta de nuevo." },
        { status: 429 },
      );
    }

    const origin = siteOrigin(req);
    const all = (await getVehicles()).filter(isPublicCatalogVehicle);

    const slugs = parseSlugs(req);
    const vehicles = slugs?.length
      ? (slugs
          .map((slug) => all.find((v) => slugMatchesVehicle(v, slug)))
          .filter(Boolean) as Vehicle[])
      : all;

    if (!vehicles.length) {
      return NextResponse.json(
        { error: "No hay vehículos para el catálogo PDF." },
        { status: 404 },
      );
    }

    const generatedAt = new Date().toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const filterSummary = slugs?.length
      ? `Selección (${vehicles.length})`
      : "Catálogo completo";

    const imageMap = await buildImageMap(vehicles, origin);
    const withPhotos = Object.keys(imageMap).filter((k) => k !== "__logo__").length;
    console.log(
      `[catalog/pdf] origin=${origin} vehicles=${vehicles.length} photosEmbedded=${withPhotos}`,
    );

    const buffer = await generateCatalogPdfBuffer(
      vehicles,
      {
        generatedAt,
        count: vehicles.length,
        filterSummary,
        origin,
      },
      imageMap,
    );

    const filename = `catalogo-rg-motors-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-RG-PDF-Photos": String(withPhotos),
      },
    });
  } catch (err) {
    console.error("[catalog/pdf]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "No se pudo generar el catálogo PDF.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { slugs?: string[] };
    const url = req.nextUrl.clone();
    if (body.slugs?.length) {
      url.searchParams.set("slugs", body.slugs.join(","));
    }
    return GET(new NextRequest(url, { headers: req.headers, method: "GET" }));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al generar PDF." },
      { status: 500 },
    );
  }
}
