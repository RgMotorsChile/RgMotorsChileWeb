import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { abortSpinUpload } from "@/lib/server/spinUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Borra los archivos de un intento de giro que no se publicó. No escribe el vehículo. */
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const result = await abortSpinUpload(body);
  return NextResponse.json(result.body, { status: result.status });
}
