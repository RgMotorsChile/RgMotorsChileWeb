import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { CATALOG_AUTOMATION_STATUS, catalogAutomationDisabledBody } from "@/lib/server/catalogAutomation";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(catalogAutomationDisabledBody(), { status: CATALOG_AUTOMATION_STATUS });
}
