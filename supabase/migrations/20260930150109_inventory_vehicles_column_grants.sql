-- P0-2 (auditorÃ­a 2026-09-30): ocultar de verdad las columnas de jefatura de vehicles (note, note_audio_path, supplier, location, source) al JWT.
-- Verificado en RgMotorsChile/inventario_rgmotors@ceefb97 (APK 1.0.3 publicado 2026-09-23 despuÃ©s del cutover): la app Flutter no consulta tablas
-- (solo RPC claim_invite/ensure_profile y Storage box-evidence); el panel web y /api/bodega/* leen vehicles con service_role (no afectado).
-- 0 consultas authenticated/anon a vehicles en edge_logs (24 h) y pg_stat_statements.
revoke select on public.vehicles from anon, authenticated;
grant select (id, tenant_id, plate, plate_norm, brand, model, year, color, status, purchase_lot, created_at, updated_at)
  on public.vehicles to authenticated;;
