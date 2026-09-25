import { NextRequest } from "next/server";
import { GET as syncGet, POST as syncPost } from "../sync/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron no admite query string; esta ruta fija el tenant Unidades Chile. */
function withUnidadesChile(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.searchParams.set("tenant", "unidades-chile");
  return new NextRequest(url, req);
}

export function GET(req: NextRequest) {
  return syncGet(withUnidadesChile(req));
}

export function POST(req: NextRequest) {
  return syncPost(withUnidadesChile(req));
}
