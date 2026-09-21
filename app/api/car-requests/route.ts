import { NextRequest, NextResponse } from "next/server";
import { getCarRequests, addCarRequest } from "@/lib/server/carRequestsStore";
import { notifyTeam } from "@/lib/server/notify";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import {
  guardPublicLeadPost,
  isValidChilePhone,
  isValidEmail,
} from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const list = await getCarRequests();
  return NextResponse.json({ requests: list, total: list.length });
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "car-requests", 8);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const clientName = String(body.clientName || "").trim();
    const phone = String(body.phone || "").trim();
    const email = body.email ? String(body.email).trim() : undefined;
    const brand = String(body.brand || "").trim();
    const model = String(body.model || "").trim();
    const maxBudget = Number(body.maxBudget);

    if (!clientName || !phone || !brand || !model || !maxBudget) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios (nombre, teléfono, marca, modelo, presupuesto)." },
        { status: 400 },
      );
    }
    if (!isValidChilePhone(phone)) {
      return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
    }

    const item = await addCarRequest({
      clientName,
      phone,
      email,
      brand,
      model,
      maxBudget,
      minYear: body.minYear ? Number(body.minYear) : undefined,
      fuel: body.fuel ? String(body.fuel).trim() : undefined,
      transmission: body.transmission ? String(body.transmission).trim() : undefined,
      notes: body.notes ? String(body.notes).trim().slice(0, 1000) : undefined,
    });

    await notifyTeam({
      type: "car-request",
      title: `Búsqueda: ${brand} ${model}`,
      body: `${clientName} · presupuesto ${maxBudget} · ${phone}`,
      meta: { id: item.id, brand, model, maxBudget },
    });

    return NextResponse.json({ success: true, request: item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar solicitud de búsqueda." },
      { status: 500 },
    );
  }
}
