import { NextRequest, NextResponse } from "next/server";
import { getTestDrives, addTestDrive, type TrafficInfo } from "@/lib/server/testDrivesStore";
import {
  buildTestDriveEmails,
  notifyCustomer,
  notifyTeam,
} from "@/lib/server/notify";
import {
  guardPublicLeadPost,
  isValidChilePhone,
  isValidEmail,
} from "@/lib/server/security";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await getTestDrives();
    return NextResponse.json({ testDrives: list });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "test-drives", 8);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const clientName = String(body.clientName || "").trim();
    const clientPhone = String(body.clientPhone || "").trim();
    const clientEmail = String(body.clientEmail || "").trim();
    const vehicleSlug = String(body.vehicleSlug || "").trim();

    if (!clientName || !clientPhone || !vehicleSlug) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios (nombre, teléfono o vehículo)" },
        { status: 400 },
      );
    }
    if (!clientEmail) {
      return NextResponse.json(
        {
          error:
            "Necesitamos tu correo para enviarte la confirmación de la visita.",
        },
        { status: 400 },
      );
    }
    if (!isValidChilePhone(clientPhone)) {
      return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
    }
    if (!isValidEmail(clientEmail)) {
      return NextResponse.json(
        { error: "Correo electrónico inválido." },
        { status: 400 },
      );
    }

    const created = await addTestDrive({
      vehicleSlug,
      vehicleTitle: String(body.vehicleTitle || vehicleSlug),
      branch: String(body.branch || "Showroom Av. El Tepual (Puerto Montt)"),
      date: String(body.date || new Date().toLocaleDateString("es-CL")),
      time: String(body.time || "11:30"),
      executive: String(body.executive || "Sin preferencia"),
      clientName,
      clientPhone,
      clientEmail,
      trafficSource:
        body.trafficSource && typeof body.trafficSource === "object"
          ? (body.trafficSource as TrafficInfo)
          : undefined,
      notes: body.notes ? String(body.notes).slice(0, 1000) : "",
    });

    const mails = buildTestDriveEmails({
      clientName,
      clientPhone,
      clientEmail,
      vehicleTitle: created.vehicleTitle,
      branch: created.branch,
      date: created.date,
      time: created.time,
      executive: created.executive,
      id: created.id,
    });

    const [teamNotify, customerNotify] = await Promise.all([
      notifyTeam({
        type: "test-drive",
        title: `Prueba de manejo: ${created.vehicleTitle} · ${created.date} ${created.time}`,
        body: mails.teamBody,
        meta: {
          id: created.id,
          vehicleSlug,
          date: created.date,
          time: created.time,
        },
      }),
      notifyCustomer({
        to: clientEmail,
        type: "test-drive-customer",
        title: `Confirmación: prueba de manejo ${created.vehicleTitle}`,
        body: mails.customerBody,
        html: mails.customerHtml,
        meta: { id: created.id, vehicleSlug },
      }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        testDrive: created,
        emails: {
          team: teamNotify.channel,
          customer: customerNotify.channel,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
