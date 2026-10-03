import { NextRequest, NextResponse } from "next/server";
import { addTradeInRequest } from "@/lib/server/tradeInStore";
import { buildLeadEmailHtml, notifyTeam } from "@/lib/server/notify";
import {
  guardPublicLeadPost,
  isValidChilePhone,
  isValidEmail,
} from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function field(body: Record<string, unknown>, key: string, max: number): string {
  return String(body[key] ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Consigna tu vehículo: guarda la solicitud (panel de tasaciones) y avisa al equipo por Resend.
 * Si el correo no sale, responde 503 para que el formulario muestre el respaldo por WhatsApp.
 */
export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "consigna", 5);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  const name = field(body, "name", 80);
  const phone = field(body, "phone", 30);
  const email = field(body, "email", 120);
  const brand = field(body, "brand", 40);
  const model = field(body, "model", 60);
  const yearRaw = field(body, "year", 4);
  const kmRaw = field(body, "km", 9).replace(/[^\d]/g, "");
  const message = field(body, "message", 1500);

  const year = Number(yearRaw);
  const km = kmRaw ? Number(kmRaw) : 0;
  const maxYear = new Date().getFullYear() + 1;

  if (!name || !phone || !email || !brand || !model || !yearRaw) {
    return NextResponse.json(
      { error: "Completa nombre, teléfono, correo, marca, modelo y año." },
      { status: 400 },
    );
  }
  if (!isValidChilePhone(phone)) {
    return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 1980 || year > maxYear) {
    return NextResponse.json({ error: "Año inválido." }, { status: 400 });
  }
  if (!Number.isFinite(km) || km < 0 || km > 2_000_000) {
    return NextResponse.json({ error: "Kilometraje inválido." }, { status: 400 });
  }

  try {
    const item = await addTradeInRequest({
      clientName: name,
      phone,
      email,
      brand,
      model,
      year,
      km,
      notes: `[Consignación] ${message}`.trim(),
    });

    const kmLabel = km ? `${km.toLocaleString("es-CL")} km` : "—";
    const notification = await notifyTeam({
      type: "consigna",
      title: `Consignación: ${brand} ${model} ${year} · ${name}`,
      body: [
        `Nombre: ${name}`,
        `Teléfono: ${phone}`,
        `Correo: ${email}`,
        `Vehículo: ${brand} ${model} ${year}`,
        `Kilometraje: ${kmLabel}`,
        `Mensaje: ${message || "—"}`,
        `ID: ${item.id}`,
      ].join("\n"),
      html: buildLeadEmailHtml("Nueva solicitud de consignación", [
        ["Nombre", name],
        ["Teléfono", phone],
        ["Correo", email],
        ["Marca", brand],
        ["Modelo", model],
        ["Año", year],
        ["Kilometraje", kmLabel],
        ["Mensaje", message],
        ["ID", item.id],
      ]),
      replyTo: email,
      meta: { id: item.id, brand, model, year },
    });

    if (notification.channel !== "email") {
      return NextResponse.json(
        {
          success: false,
          emailed: false,
          id: item.id,
          error:
            "No pudimos enviar tu solicitud por correo en este momento. Escríbenos por WhatsApp y la revisamos de inmediato.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true, emailed: true, id: item.id });
  } catch (err) {
    console.error("[consigna] error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "No se pudo procesar la solicitud. Escríbenos por WhatsApp." },
      { status: 500 },
    );
  }
}
