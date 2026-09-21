import { NextRequest, NextResponse } from "next/server";
import { getPriceAlerts, addPriceAlert } from "@/lib/server/priceAlertsStore";
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
  const list = await getPriceAlerts();
  return NextResponse.json({ alerts: list, total: list.length });
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "price-alerts", 8);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const vehicleSlug = String(body.vehicleSlug || "").trim();
    const vehicleName = String(body.vehicleName || "").trim();
    const phone = String(body.phone || "").trim();
    const clientName = String(body.clientName || "").trim();
    const email = body.email ? String(body.email).trim() : undefined;

    if (!vehicleSlug || !vehicleName || !phone || !clientName) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios para la alerta de precio." },
        { status: 400 },
      );
    }
    if (!isValidChilePhone(phone)) {
      return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
    }

    const item = await addPriceAlert({
      vehicleSlug,
      vehicleName,
      currentPrice: Number(body.currentPrice || 0),
      targetPrice: body.targetPrice ? Number(body.targetPrice) : undefined,
      clientName,
      phone,
      email,
    });

    await notifyTeam({
      type: "price-alert",
      title: `Alerta precio: ${vehicleName}`,
      body: `${clientName} · ${phone}`,
      meta: { id: item.id, vehicleSlug },
    });

    return NextResponse.json({ success: true, alert: item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al registrar alerta de precio." },
      { status: 500 },
    );
  }
}
