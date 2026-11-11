import { NextRequest, NextResponse } from "next/server";
import { CATALOG_AUTOMATION_STATUS, catalogAutomationDisabledBody } from "@/lib/server/catalogAutomation";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  return authorizeMachineSecret(req, ["CRON_SECRET"], {
    allowQuerySecret: true,
    allowQueryInProd: process.env.CRON_ALLOW_QUERY_SECRET === "1",
    searchParams: req.nextUrl.searchParams,
    logLabel: "PhotosResync",
  });
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json(catalogAutomationDisabledBody(), { status: CATALOG_AUTOMATION_STATUS });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
