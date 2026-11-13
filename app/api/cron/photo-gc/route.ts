import { NextRequest, NextResponse } from "next/server";
import { authorizeMachineSecret } from "@/lib/auth/machineAuth";
import { runVehiclePhotoOrphanCleanup } from "@/lib/server/vehiclePhotoGc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  return authorizeMachineSecret(req, ["CRON_SECRET"], {
    allowQuerySecret: true,
    allowQueryInProd: process.env.CRON_ALLOW_QUERY_SECRET === "1",
    searchParams: req.nextUrl.searchParams,
    logLabel: "PhotoGc",
  });
}

/**
 * Red de seguridad: reintenta public.vehicle_photo_orphans y borra objetos
 * de vehicle-photos que nadie cita, con un margen de minutos.
 * GitHub Actions lo llama una vez al día. dryRun=1 solo lista.
 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const result = await runVehiclePhotoOrphanCleanup({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo limpiar fotos huérfanas.";
    console.error("[PhotoGc]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
