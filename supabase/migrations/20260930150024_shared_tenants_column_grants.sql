-- P0-1 (auditorÃ­a 2026-09-30): ocultar de verdad sheet_id, drive_folder_id y settings a los clientes.
-- Un REVOKE de columna no sirve mientras exista el GRANT de tabla, por eso se quita el SELECT de tabla y se concede por columna.
-- Verificado: RgMotorsChileWeb, UnidadesChile, boletas_rg (web + Flutter) e inventario solo piden tenants?select=id&slug=eq.<slug>;
-- policies y boletas_tenant_id() (security invoker) usan id, slug y active. Sync y edge functions usan service_role (no afectado).
revoke select on public.tenants from anon, authenticated;
grant select (id, slug, name, active) on public.tenants to anon, authenticated;;
