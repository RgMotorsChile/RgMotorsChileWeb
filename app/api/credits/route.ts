import { NextRequest, NextResponse } from "next/server";
import { getCreditApplications, addCreditApplication } from "@/lib/server/creditsStore";
import { notifyTeam } from "@/lib/server/notify";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import {
  guardPublicLeadPost,
  isValidChilePhone,
  isValidEmail,
  optionalValidRut,
} from "@/lib/server/security";
import { formatRut } from "@/lib/rut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const list = await getCreditApplications();
    return NextResponse.json({ credits: list, total: list.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener créditos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "credits", 8);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const clientName = String(body.clientName || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const rutRaw = body.rut ? String(body.rut).trim() : undefined;

    if (!clientName || !email || !phone) {
      return NextResponse.json(
        { error: "Por favor completa tu nombre, correo electrónico y teléfono." },
        { status: 400 },
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
    }
    if (!isValidChilePhone(phone)) {
      return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
    }
    const rutErr = optionalValidRut(rutRaw);
    if (rutErr) {
      return NextResponse.json({ error: rutErr }, { status: 400 });
    }

    const credit = await addCreditApplication({
      clientName,
      rut: rutRaw ? formatRut(rutRaw) : undefined,
      email,
      phone,
      vehicleSlug: String(body.vehicleSlug || "simulacion-general").trim(),
      downPct: Number(body.downPct || 20),
      downPayment: body.downPayment ? Number(body.downPayment) : undefined,
      term: Number(body.term || 48),
      monthlyEstimate: Number(body.monthlyEstimate || 0),
      income: body.income ? Number(body.income) : undefined,
      employmentType: body.employmentType ? String(body.employmentType).trim() : undefined,
      maxApprovedAmount: body.maxApprovedAmount ? Number(body.maxApprovedAmount) : undefined,
      status: "En evaluación",
      trafficSource: body.trafficSource,
      notes: body.notes
        ? String(body.notes).trim().slice(0, 1000)
        : `Simulación de crédito para ${clientName} (RUT: ${rutRaw || "No especificado"}).`,
    });

    await notifyTeam({
      type: "credit",
      title: `Nueva simulación de crédito: ${credit.clientName}`,
      body: `${credit.clientName} (RUT: ${credit.rut || "n/d"}) solicitó simulación. Vehículo: ${credit.vehicleSlug}. Contacto: ${credit.email} / ${credit.phone}.`,
      meta: {
        id: credit.id,
        clientName: credit.clientName,
        rut: credit.rut,
        email: credit.email,
        phone: credit.phone,
        vehicleSlug: credit.vehicleSlug,
      },
    });

    return NextResponse.json({
      success: true,
      credit,
      message: `Simulación recibida. Te contactaremos a ${credit.email}. Esto no es una pre-aprobación bancaria ni un pago online.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al procesar crédito." },
      { status: 500 },
    );
  }
}
