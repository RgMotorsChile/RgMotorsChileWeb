import { NextRequest, NextResponse } from "next/server";
import { getVehicles, saveVehicle } from "@/lib/server/vehiclesStore";
import { Vehicle } from "@/lib/vehicles";
import { toVehicleCardDTO } from "@/lib/vehicles/publicFields";
import { isCamionetaBody, isPublicCatalogVehicle } from "@/lib/vehicles/publicCatalog";
import { requireAdminSession } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matchesBodyTypeQuery(vehicleBody: string, query: string): boolean {
  const q = query.toLowerCase();
  if (isCamionetaBody(q) && isCamionetaBody(vehicleBody)) return true;
  return vehicleBody.toLowerCase() === q;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const adminRequested = searchParams.get("admin") === "true";
    const isAdmin = adminRequested ? await requireAdminSession() : false;
    if (adminRequested && !isAdmin) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    let list = await getVehicles({ bypassCache: isAdmin });

    const featured = searchParams.get("featured");
    if (featured === "true") {
      list = list.filter((v) => v.featured);
    }

    const brand = searchParams.get("brand");
    if (brand) {
      list = list.filter((v) => v.brand.toLowerCase() === brand.toLowerCase());
    }

    const bodyType = searchParams.get("bodyType");
    if (bodyType) {
      list = list.filter((v) => matchesBodyTypeQuery(v.bodyType, bodyType));
    }

    const status = searchParams.get("status");
    if (status) {
      list = list.filter((v) => (v.status || "Disponible").toLowerCase() === status.toLowerCase());
    }

    // Exclude drafts / sold unless admin mode autenticado
    if (!isAdmin) {
      list = list.filter(isPublicCatalogVehicle);
    }

    const fields = searchParams.get("fields");
    const payload =
      fields === "card" || fields === "summary"
        ? list.map(toVehicleCardDTO)
        : list;

    const res = NextResponse.json({ vehicles: payload, total: payload.length });
    if (isAdmin || process.env.NODE_ENV !== "production") {
      res.headers.set("Cache-Control", "private, no-store");
    } else {
      res.headers.set(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=120",
      );
    }
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener vehículos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Partial<Vehicle>;

    if (!body.brand || !body.model || !body.year || !body.price) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios (marca, modelo, año, precio)." },
        { status: 400 },
      );
    }

    const slug =
      body.slug && /^[a-z0-9-]+$/i.test(body.slug)
        ? body.slug.toLowerCase()
        : `${body.brand}-${body.model}-${body.year}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

    const vehicle: Vehicle = {
      slug,
      brand: String(body.brand).trim(),
      model: String(body.model).trim(),
      version: String(body.version || "1.0").trim(),
      year: Number(body.year),
      price: Number(body.price),
      km: Number(body.km || 0),
      fuel: body.fuel || "Bencina",
      transmission: body.transmission || "Automática",
      bodyType: body.bodyType || "SUV",
      location: String(body.location || "Puerto Montt, Los Lagos").trim(),
      image: body.image || "/cars/toyota-rav4-hibrido.jpg",
      engine: String(body.engine || "2.0L").trim(),
      power: String(body.power || "150 HP").trim(),
      traction: String(body.traction || "4x2").trim(),
      doors: Number(body.doors || 5),
      owners: Number(body.owners || 1),
      featured: Boolean(body.featured),
      status: body.status || "Disponible",
      highlights:
        Array.isArray(body.highlights) && body.highlights.length > 0
          ? body.highlights
          : [
              "Inspección de 150 puntos aprobada",
              "Mantenciones al día",
              "Documentación y transferencia al día",
            ],
      spin: body.spin && body.spin.count ? body.spin : undefined,
    };

    const res = await saveVehicle(vehicle);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, vehicle });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar el vehículo." },
      { status: 500 },
    );
  }
}
