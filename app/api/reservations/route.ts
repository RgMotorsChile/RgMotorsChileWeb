import { NextRequest, NextResponse } from "next/server";
import { getReservations, addReservation } from "@/lib/server/reservationsStore";
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
  try {
    const list = await getReservations();
    return NextResponse.json({ reservations: list, total: list.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener reservas." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "reservations", 8);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const clientName = String(body.clientName || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const vehicleSlug = String(body.vehicleSlug || "").trim();

    if (!clientName || !vehicleSlug) {
      return NextResponse.json({ error: "Faltan datos de la reserva." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
    }
    if (!phone || !isValidChilePhone(phone)) {
      return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
    }

    // Sin pasarela: siempre solicitud Pendiente (no Pagada)
    const reservation = await addReservation({
      clientName,
      email,
      phone,
      vehicleSlug,
      amount: Number(body.amount ?? 200000),
      method: "solicitud-web",
      status: "Pendiente",
      notes: body.notes ? String(body.notes).trim().slice(0, 1000) : undefined,
      trafficSource: body.trafficSource,
    });

    await notifyTeam({
      type: "reservation",
      title: `Nueva solicitud de reserva: ${reservation.vehicleSlug}`,
      body: `${reservation.clientName} (${reservation.phone} / ${reservation.email}) solicitó reservar ${reservation.vehicleSlug}. Sin cobro online — coordinar abono por WhatsApp/tienda. Estado: ${reservation.status}.`,
      meta: {
        id: reservation.id,
        vehicleSlug: reservation.vehicleSlug,
        clientName: reservation.clientName,
        phone: reservation.phone,
        email: reservation.email,
        amount: reservation.amount,
        status: reservation.status,
      },
    });

    return NextResponse.json({ success: true, reservation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al registrar la reserva." },
      { status: 500 },
    );
  }
}
