import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncFromLiveGoogleSheet } from "@/lib/server/googleSheetSyncService";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook de solo lectura: Google Sheets / Apps Script avisa un cambio
 * y la web refresca el inventario en KV. Nunca escribe en Excel ni Drive.
 *
 * Auth: Authorization: Bearer <CRON_SECRET|INVENTORY_SYNC_SECRET>
 *       o header x-inventory-sync-secret
 * Body opcional: { "sheetId": "...", "source": "apps-script" }
 */
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
    status: "ready",
    mode: "read-only",
  });
}

export async function POST(req: NextRequest) {
  if (!authorizeWebhook(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let sheetId: string | undefined;
  let source = "webhook";
  try {
    const body = (await req.json()) as { sheetId?: string; source?: string };
    sheetId = body?.sheetId;
    if (body?.source) source = String(body.source).slice(0, 64);
  } catch {
    /* body vacío OK */
  }

  console.log(
    `[InventoryWebhook] Sync solo-lectura desde ${source} (no escribe Sheets/Drive)…`,
  );

  const report = await syncFromLiveGoogleSheet(sheetId);

  try {
    revalidatePath("/");
    revalidatePath("/catalogo");
    revalidatePath("/api/vehicles");
  } catch {
    /* noop en entornos sin cache */
  }

  return NextResponse.json({
    ...report,
    mode: "read-only",
    source,
    touchedGoogleSheet: false,
    touchedGoogleDrive: false,
    timestamp: new Date().toISOString(),
  });
}
