import { NextRequest, NextResponse } from "next/server";
import { CATALOG_AUTOMATION_STATUS, catalogAutomationDisabledBody } from "@/lib/server/catalogAutomation";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeWebhook(req: NextRequest): boolean {
  return authorizeMachineSecret(
    req,
    ["INVENTORY_SYNC_SECRET", "CRON_SECRET"],
    {
      extraHeaderNames: ["x-inventory-sync-secret"],
      logLabel: "InventoryWebhook",
    },
  );
}

export async function GET() {
  return NextResponse.json({
    status: "disabled",
    mode: "read-only",
    disabled: true,
  });
}

export async function POST(req: NextRequest) {
  if (!authorizeWebhook(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(catalogAutomationDisabledBody(), { status: CATALOG_AUTOMATION_STATUS });
}
