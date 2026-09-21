import { NextRequest, NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/server/db";
import { notifyTeam } from "@/lib/server/notify";
import { COMPANY } from "@/lib/company";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import {
  guardPublicLeadPost,
  isValidChilePhone,
  isValidEmail,
} from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ContactMessage = {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  trafficSource?: unknown;
  createdAt: string;
  status: "Nuevo" | "Contactado" | "Cerrado";
};

const FILENAME = "contact-messages.json";

async function listMessages(): Promise<ContactMessage[]> {
  return readJson<ContactMessage[]>(FILENAME, []);
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const list = await listMessages();
  return NextResponse.json({ messages: list, total: list.length });
}

export async function POST(req: NextRequest) {
  const guard = await guardPublicLeadPost(req, "contact", 8);
  if (!guard.ok) return guard.response;
  const body = guard.body;

  try {
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !phone || !email || !message) {
      return NextResponse.json(
        { error: "Completa nombre, teléfono, correo y mensaje." },
        { status: 400 },
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Correo electrónico inválido." }, { status: 400 });
    }
    if (!isValidChilePhone(phone)) {
      return NextResponse.json({ error: "Teléfono inválido." }, { status: 400 });
    }
    if (name.length > 80 || message.length > 2000) {
      return NextResponse.json({ error: "Datos demasiado largos." }, { status: 400 });
    }

    const entry: ContactMessage = {
      id: `MSG_${Date.now().toString(36)}`,
      name,
      phone,
      email,
      message: message.slice(0, 2000),
      trafficSource: body.trafficSource,
      createdAt: new Date().toISOString(),
      status: "Nuevo",
    };

    const list = await listMessages();
    list.unshift(entry);
    await writeJson(FILENAME, list.slice(0, 1000));

    await notifyTeam({
      type: "contact",
      title: `Nuevo contacto web: ${name}`,
      body: `${message}\n\nTel: ${phone}\nEmail: ${email}\nDestino equipo: ${COMPANY.email}`,
      meta: { id: entry.id, phone, email },
    });

    return NextResponse.json({
      success: true,
      id: entry.id,
      message: "Mensaje recibido. Un asesor te contactará pronto.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al enviar mensaje." },
      { status: 500 },
    );
  }
}
