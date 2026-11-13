import { NextResponse } from "next/server";
import { runAutoSync } from "@/lib/server/autoSyncScheduler";
import { requireAdminSession } from "@/lib/auth/requireAdmin";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const result = await runAutoSync();
  return NextResponse.json(result);
}
