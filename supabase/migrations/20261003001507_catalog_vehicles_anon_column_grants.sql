-- P1-1 (auditoría 2026-10-02): anon ya no puede leer columnas internas del catálogo (supplier, tech_review, payload, circ_permit, cover_locked).
-- unidadeschile.cl usa select explícito con estas columnas; rgmotorschile.cl lee con service_role (no afectado).
revoke select on public.catalog_vehicles from anon;
grant select (id, tenant_id, slug, plate, plate_norm, brand, model, version, year, price, list_price, km, fuel, transmission, body_type, location, image, gallery, spin, engine, power, traction, doors, owners, featured, status, has_real_photos, highlights, created_at, updated_at)
  on public.catalog_vehicles to anon;
