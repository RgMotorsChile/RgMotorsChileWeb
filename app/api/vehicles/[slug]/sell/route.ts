import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { getVehicleBySlug } from "@/lib/server/vehiclesStore";
import { markVehicleAsSold } from "@/lib/server/soldVehiclesStore";
import { isSaleSupplier } from "@/lib/sales/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/vehicles/[slug]/sell
 * Body: { supplier: "RG Motors"|"Unidades Chile"|"Salgado Automotoriz", salePrice?: number, notes?: string }
 *
 * Archiva en historial, borra fotos (Blob + local) y elimina del inventario activo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await params;
  try {
    const vehicle = await getVehicleBySlug(slug, {
      bypassCache: true,
      scope: "staff",
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado." }, { status: 404 });
    }

    const body = (await req.json()) as {
      supplier?: string;
      salePrice?: number;
      notes?: string;
    };

    if (!isSaleSupplier(body.supplier)) {
      return NextResponse.json(
        {
          error:
            "Indicá quién vendió: RG Motors, Unidades Chile o Salgado Automotoriz.",
        },
        { status: 400 },
      );
    }

    const result = await markVehicleAsSold({
      vehicle,
      supplier: body.supplier,
      salePrice: body.salePrice,
      notes: body.notes,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      record: result.record,
      message: `Vendido por ${body.supplier}. Fotos eliminadas. Registro en historial.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Error al registrar la venta.",
      },
      { status: 500 },
    );
  }
}
