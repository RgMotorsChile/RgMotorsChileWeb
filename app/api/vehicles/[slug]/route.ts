import { NextRequest, NextResponse } from "next/server";
import { getVehicleBySlug, saveVehicle, deleteVehicle } from "@/lib/server/vehiclesStore";
import { Vehicle } from "@/lib/vehicles";
import { isPublicCatalogVehicle } from "@/lib/vehicles/publicCatalog";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { stripPlateForPublic } from "@/lib/vehicles/publicFields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const v = await getVehicleBySlug(slug);
  if (!v) {
    return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });
  }

  const isAdmin = await requireAdminSession();
  if (!isAdmin && !isPublicCatalogVehicle(v)) {
    return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    vehicle: isAdmin ? v : stripPlateForPublic(v),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await params;
  try {
    const existing = await getVehicleBySlug(slug, { bypassCache: true });
    if (!existing) {
      return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });
    }

    const body = (await req.json()) as Partial<Vehicle>;

    if (body.status === "Vendido" && existing.status !== "Vendido") {
      return NextResponse.json(
        {
          error:
            "Para marcar como vendido usá el flujo de venta (elige quién vendió). Se borrarán las fotos y quedará en el historial.",
          useEndpoint: `/api/vehicles/${slug}/sell`,
        },
        { status: 400 },
      );
    }

    const updated: Vehicle = {
      ...existing,
      ...body,
      slug, // protect original slug unless explicitly handling rename
    };

    const res = await saveVehicle(updated);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, vehicle: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar vehículo." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await params;
  try {
    const res = await deleteVehicle(slug);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: `Vehículo ${slug} eliminado.` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al eliminar vehículo." },
      { status: 500 }
    );
  }
}
