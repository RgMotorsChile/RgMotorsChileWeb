import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { commitSpinUpload } from "@/lib/server/spinUpload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Confirma el giro solo si Storage tiene todos los fotogramas.
 * Si falta alguno, responde 409 y no toca la base.
 */
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
  const result = await commitSpinUpload(body);
  return NextResponse.json(result.body, { status: result.status });
}
