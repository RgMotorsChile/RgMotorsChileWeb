import { NextRequest, NextResponse } from "next/server";
import { getTradeInRequests, addTradeInRequest } from "@/lib/server/tradeInStore";
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
  const list = await getTradeInRequests();
  return NextResponse.json({ requests: list, total: list.length });
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "trade-in", 8);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const clientName = String(body.clientName || "").trim();
    const phone = String(body.phone || "").trim();
    const email = body.email ? String(body.email).trim() : undefined;
    const brand = String(body.brand || "").trim();
    const model = String(body.model || "").trim();
    const year = Number(body.year);

    if (!clientName || !phone || !brand || !model || !year) {
      return NextResponse.json(
        { error: "Faltan datos de tasación (nombre, teléfono, marca, modelo, año)." },
        { status: 400 },
      );
    }
    if (!isValidChilePhone(phone)) {
      return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
    }

    const item = await addTradeInRequest({
      clientName,
      phone,
      email,
      brand,
      model,
      year,
      km: Number(body.km || 0),
      targetVehicleSlug: body.targetVehicleSlug
        ? String(body.targetVehicleSlug).trim()
        : undefined,
      notes: body.notes ? String(body.notes).trim().slice(0, 1000) : undefined,
      estimatedAppraisal: body.estimatedAppraisal
        ? Number(body.estimatedAppraisal)
        : undefined,
    });

    await notifyTeam({
      type: "trade-in",
      title: `Tasación: ${brand} ${model} ${year}`,
      body: `${clientName} · ${phone} · ${email || "sin email"}`,
      meta: { id: item.id, brand, model, year },
    });

    return NextResponse.json({ success: true, request: item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar solicitud de tasación." },
      { status: 500 },
    );
  }
}
