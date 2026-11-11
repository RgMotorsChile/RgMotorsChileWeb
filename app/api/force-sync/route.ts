import { NextResponse } from "next/server";
import { CATALOG_AUTOMATION_STATUS, catalogAutomationDisabledBody } from "@/lib/server/catalogAutomation";
import { runAutoSync } from "@/lib/server/autoSyncScheduler";
import { requireAdminSession } from "@/lib/auth/requireAdmin";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(catalogAutomationDisabledBody(), { status: CATALOG_AUTOMATION_STATUS });
  const result = await runAutoSync();
  return NextResponse.json(result);
}
