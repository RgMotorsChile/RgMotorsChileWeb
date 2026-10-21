import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/requireAdmin";
import { isBlobReady } from "@/lib/server/storageHealth";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  CleanupAbort,
  computeCleanupPlan,
  deleteCandidates,
  getCleanupLog,
  pickCategories,
} from "@/lib/server/blobCleanup";
import { selectionFingerprint } from "@/lib/server/blobCleanupCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function guard() {
  if (!isBlobReady()) return NextResponse.json({ error: "Falta configurar Blob." }, { status: 503 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Falta configurar Supabase." }, { status: 503 });
  return null;
}

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : "Error al revisar las fotos.";
  console.error("[admin/blob-cleanup]", err);
  return NextResponse.json({ error: msg }, { status: err instanceof CleanupAbort ? 409 : 500 });
}

/** GET: vista previa (no borra nada). ?log=1 devuelve el registro de borrados. */
export async function GET(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (req.nextUrl.searchParams.get("log") === "1") {
    return NextResponse.json({ log: await getCleanupLog() });
  }
  const g = guard();
  if (g) return g;
  try {
    const plan = await computeCleanupPlan();
    return NextResponse.json({
      totals: plan.totals,
      byCategory: plan.byCategory,
      protectedCounts: plan.protectedCounts,
      candidates: plan.candidates.map((c) => ({
        url: c.url,
        pathname: c.pathname,
        size: c.size,
        category: c.category,
        slug: c.slug,
        reason: c.reason,
      })),
    });
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST { categories: string[], fingerprint: string, confirm: "BORRAR" }
 * Recalcula en el servidor; solo borra si la selección es idéntica a la vista previa.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const g = guard();
  if (g) return g;
  let body: { categories?: unknown; fingerprint?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const categories = Array.isArray(body.categories) ? body.categories.map(String) : [];
  if (body.confirm !== "BORRAR" || categories.length === 0 || typeof body.fingerprint !== "string") {
    return NextResponse.json({ error: "Falta confirmar el borrado." }, { status: 400 });
  }
  try {
    const plan = await computeCleanupPlan();
    const sel = pickCategories(plan.candidates, categories);
    if (selectionFingerprint(sel) !== body.fingerprint) {
      return NextResponse.json(
        { error: "La lista cambió desde la vista previa. Vuelve a revisarla antes de borrar." },
        { status: 409 },
      );
    }
    const res = await deleteCandidates(sel, categories);
    return NextResponse.json({ success: true, ...res });
  } catch (err) {
    return fail(err);
  }
}
