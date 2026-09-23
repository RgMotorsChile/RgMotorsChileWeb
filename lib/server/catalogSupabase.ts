/**
 * Catálogo desde Supabase (`catalog_vehicles`) — fuente de verdad multi-tenant.
 */
import type { Vehicle } from "@/lib/vehicles";
import {
  createServerSupabase,
  isSupabaseConfigured,
  RG_MOTORS_TENANT_SLUG,
} from "@/lib/supabase/client";

function rowToVehicle(row: Record<string, unknown>): Vehicle {
  return {
    slug: String(row.slug),
    plate: row.plate ? String(row.plate) : undefined,
    brand: String(row.brand),
    model: String(row.model),
    version: String(row.version || ""),
    year: Number(row.year) || 0,
    price: Number(row.price) || 0,
    listPrice: row.list_price != null ? Number(row.list_price) : undefined,
    km: Number(row.km) || 0,
    fuel: String(row.fuel || ""),
    transmission: String(row.transmission || ""),
    bodyType: String(row.body_type || ""),
    location: String(row.location || ""),
    image: String(row.image || ""),
    gallery: Array.isArray(row.gallery) ? (row.gallery as string[]) : undefined,
    spin: (row.spin as Vehicle["spin"]) || undefined,
    engine: String(row.engine || ""),
    power: String(row.power || ""),
    traction: String(row.traction || ""),
    doors: Number(row.doors) || 4,
    owners: Number(row.owners) || 1,
    featured: Boolean(row.featured),
    status: (row.status as Vehicle["status"]) || "Disponible",
    hasRealPhotos: Boolean(row.has_real_photos),
    coverLocked: Boolean(row.cover_locked),
    supplier: row.supplier ? String(row.supplier) : undefined,
    techReview: row.tech_review ? String(row.tech_review) : undefined,
    circPermit: row.circ_permit ? String(row.circ_permit) : undefined,
    highlights: Array.isArray(row.highlights)
      ? (row.highlights as string[])
      : undefined,
  };
}

export async function getCatalogVehiclesFromSupabase(
  tenantSlug: string = RG_MOTORS_TENANT_SLUG,
): Promise<Vehicle[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createServerSupabase();
    const { data: tenant, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tErr || !tenant) return null;

    const { data, error } = await sb
      .from("catalog_vehicles")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("featured", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error || !data) return null;
    return data.map((r) => rowToVehicle(r as Record<string, unknown>));
  } catch (err) {
    console.warn("[catalogSupabase] lectura falló:", err);
    return null;
  }
}

function vehicleToRow(v: Vehicle, tenantId: string): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    slug: v.slug,
    plate: v.plate ?? null,
    brand: v.brand,
    model: v.model,
    version: v.version || "",
    year: v.year,
    price: v.price,
    list_price: v.listPrice ?? null,
    km: v.km,
    fuel: v.fuel || "",
    transmission: v.transmission || "",
    body_type: v.bodyType || "",
    location: v.location || "",
    image: v.image || "",
    gallery: v.gallery ?? [],
    spin: v.spin ?? null,
    engine: v.engine || "",
    power: v.power || "",
    traction: v.traction || "",
    doors: v.doors || 4,
    owners: v.owners || 1,
    featured: Boolean(v.featured),
    status: v.status || "Disponible",
    has_real_photos: Boolean(v.hasRealPhotos),
    cover_locked: Boolean(v.coverLocked),
    supplier: v.supplier ?? null,
    tech_review: v.techReview ?? null,
    circ_permit: v.circPermit ?? null,
    highlights: v.highlights ?? [],
    updated_at: new Date().toISOString(),
  };
}

/** Upsert catálogo por tenant (sync Sheet / import). */
export async function upsertCatalogVehiclesToSupabase(
  vehicles: Vehicle[],
  tenantSlug: string = RG_MOTORS_TENANT_SLUG,
): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, count: 0, error: "Supabase no configurado" };
  }
  try {
    const sb = createServerSupabase();
    const { data: tenant, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tErr || !tenant) {
      return { ok: false, count: 0, error: tErr?.message || "Tenant no encontrado" };
    }

    const rows = vehicles.map((v) => vehicleToRow(v, tenant.id));
    const chunk = 50;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await sb.from("catalog_vehicles").upsert(slice, {
        onConflict: "tenant_id,slug",
      });
      if (error) {
        return { ok: false, count: i, error: error.message };
      }
    }
    return { ok: true, count: rows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[catalogSupabase] upsert falló:", msg);
    return { ok: false, count: 0, error: msg };
  }
}

/** Borra un vehículo del catálogo por slug. */
export async function deleteCatalogVehicleFromSupabase(
  slug: string,
  tenantSlug: string = RG_MOTORS_TENANT_SLUG,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado" };
  }
  try {
    const sb = createServerSupabase();
    const { data: tenant, error: tErr } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tErr || !tenant) {
      return { ok: false, error: tErr?.message || "Tenant no encontrado" };
    }
    const { error } = await sb
      .from("catalog_vehicles")
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("slug", slug);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
