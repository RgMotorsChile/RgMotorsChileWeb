import { NextResponse } from "next/server";
import { CATALOG_AUTOMATION_STATUS, catalogAutomationDisabledBody } from "@/lib/server/catalogAutomation";
import { getSoldVehicles } from "@/lib/server/soldVehiclesStore";
import { requireAdminSession } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const sold = await getSoldVehicles();
  return NextResponse.json({
    status: "disabled",
    soldArchiveCount: sold.length,
    disabled: true,
    message: "El catalogo solo se administra desde el panel. La sincronizacion con Google Sheets esta desactivada.",
  });
}

export async function POST() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(catalogAutomationDisabledBody(), { status: CATALOG_AUTOMATION_STATUS });
}
