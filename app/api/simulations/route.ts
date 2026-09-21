import { NextRequest, NextResponse } from "next/server";
import { addSimulationEvent, getSimulationEvents } from "@/lib/server/simulationsStore";
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
    const list = await getSimulationEvents();
    return NextResponse.json({ simulations: list, total: list.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al listar simulaciones." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "simulations", 40);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const sessionId = String(body.sessionId || "").slice(0, 64);
    if (!sessionId) {
      return NextResponse.json({ error: "Falta sessionId." }, { status: 400 });
    }

    const eventType = body.eventType === "lead_submit" ? "lead_submit" : "view_calc";

    const clientName = body.clientName ? String(body.clientName).trim() : undefined;
    const phone = body.phone ? String(body.phone).trim() : undefined;
    const email = body.email ? String(body.email).trim() : undefined;
    let rut = body.rut ? String(body.rut).trim() : undefined;

    if (eventType === "lead_submit") {
      if (email && !isValidEmail(email)) {
        return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
      }
      if (phone && !isValidChilePhone(phone)) {
        return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
      }
      const rutErr = optionalValidRut(rut);
      if (rutErr) {
        return NextResponse.json({ error: rutErr }, { status: 400 });
      }
      if (rut) rut = formatRut(rut);
      if (!phone && !email) {
        return NextResponse.json(
          { error: "Indica teléfono o correo para contactarte." },
          { status: 400 },
        );
      }
    }

    const allowedSources = ["simulador", "ficha", "modal", "catalogo", "otro"] as const;
    const rawSource = String(body.source || "simulador");
    const source = (allowedSources as readonly string[]).includes(rawSource)
      ? (rawSource as (typeof allowedSources)[number])
      : "otro";

    const event = await addSimulationEvent({
      sessionId,
      source,
      vehicleSlug: body.vehicleSlug ? String(body.vehicleSlug) : undefined,
      vehiclePrice: body.vehiclePrice != null ? Number(body.vehiclePrice) : undefined,
      vehicleYear: body.vehicleYear != null ? Number(body.vehicleYear) : undefined,
      productId: String(body.productId || "autofin"),
      downPct: Number(body.downPct || 20),
      downPayment: Number(body.downPayment || 0),
      termMonths: Number(body.termMonths || 48),
      monthlyPayment: Number(body.monthlyPayment || 0),
      financed: Number(body.financed || 0),
      monthlyRate: Number(body.monthlyRate || 0),
      caeApprox: Number(body.caeApprox || 0),
      clientName,
      phone,
      email,
      rut,
      income: body.income != null ? Number(body.income) : undefined,
      employmentType: body.employmentType ? String(body.employmentType) : undefined,
      trafficSource: body.trafficSource,
      eventType,
    });

    if (eventType === "lead_submit" && (event.phone || event.email)) {
      await notifyTeam({
        type: "simulation-lead",
        title: `Lead simulación: ${event.clientName || "Sin nombre"}`,
        body: `${event.clientName || "Cliente"} · ${event.phone || ""} · ${event.email || ""} · cuota ${event.monthlyPayment}`,
        meta: { id: event.id, sessionId: event.sessionId },
      });
    }

    return NextResponse.json({ success: true, simulation: event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar simulación." },
      { status: 500 },
    );
  }
}
