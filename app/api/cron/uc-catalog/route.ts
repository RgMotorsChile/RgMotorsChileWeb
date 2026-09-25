import { NextRequest, NextResponse } from "next/server";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";
import { getVehicles, saveVehicle } from "@/lib/server/vehiclesStore";
import {
  normalizeMediaUrl,
  orderGalleryWithCover,
} from "@/lib/vehicles/frontCoverMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT = "unidades-chile";

function authorize(req: NextRequest) {
  return authorizeMachineSecret(req, ["CRON_SECRET"], {
    logLabel: "UcCatalogWrite",
  });
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    image?: string;
    gallery?: unknown;
  };
  const slug = String(body.slug || "").trim();
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "Slug inválido." }, { status: 400 });
  }

  const list = await getVehicles({ bypassCache: true, tenantSlug: TENANT });
  const current = list.find((v) => v.slug === slug);
  if (!current) {
    return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });
  }

  const gallery = Array.isArray(body.gallery)
    ? body.gallery.map((u) => normalizeMediaUrl(String(u))).filter(Boolean)
    : current.gallery || [];
  const image = normalizeMediaUrl(String(body.image || gallery[0] || current.image || ""));
  const ordered = orderGalleryWithCover(image, gallery.length ? gallery : image ? [image] : []);

  const saved = await saveVehicle(
    {
      ...current,
      image: ordered[0] || image,
      gallery: ordered,
      hasRealPhotos: ordered.length > 0,
      coverLocked: true,
    },
    { tenantSlug: TENANT },
  );
  if (!saved.success) {
    return NextResponse.json(
      { error: saved.error || "No se pudo guardar la portada." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    success: true,
    coverImage: ordered[0] || image,
    gallery: ordered,
  });
}
