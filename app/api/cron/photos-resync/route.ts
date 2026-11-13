import { NextRequest, NextResponse } from "next/server";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";
import {
  PHOTOS_RESYNC_BUDGET_MS,
  parsePhotosResyncRequest,
  runPhotosResyncBatch,
} from "@/lib/server/photosResync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby corta a los 60s. El lote cabe en el presupuesto de abajo. */
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  return authorizeMachineSecret(req, ["CRON_SECRET"], {
    allowQuerySecret: true,
    allowQueryInProd: process.env.CRON_ALLOW_QUERY_SECRET === "1",
    searchParams: req.nextUrl.searchParams,
    logLabel: "PhotosResync",
  });
}

/**
 * Un lote del re-sync Blob → Supabase.
 * Authorization: Bearer CRON_SECRET, el mismo de /api/cron/sync.
 * `cursor` (rg-motors o rg-motors:<slug>) y `limit` (1–8) parten el trabajo.
 * La respuesta trae `nextCursor`; vacío y `done: true` cuando terminaron los dos tenants.
 */
async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const parsed = parsePhotosResyncRequest({
    cursor: params.get("cursor"),
    tenant: params.get("tenant"),
    limit: params.get("limit"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  try {
    const result = await runPhotosResyncBatch({
      cursor: params.get("cursor"),
      tenant: params.get("tenant"),
      limit: parsed.limit,
      deadlineAt: Date.now() + PHOTOS_RESYNC_BUDGET_MS,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falló el re-sync.";
    console.error("[PhotosResync]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
