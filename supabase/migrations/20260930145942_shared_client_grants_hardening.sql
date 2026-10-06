-- P1-5 (auditorÃ­a 2026-09-30): quitar privilegios sobrantes a los roles cliente. Excluye tablas de boletas (expenses, expense_profiles).
-- Verificado: 0 escrituras anon en edge_logs (24 h) y pg_stat_statements; los sitios de catÃ¡logo e inventario escriben con service_role.
revoke truncate, trigger, references on
  public.tenants, public.tenant_members, public.site_settings, public.sync_state, public.audit_log,
  public.catalog_vehicles, public.catalog_leads,
  public.profiles, public.invites, public.categories, public.items, public.vehicles,
  public.boxes, public.box_lines, public.box_evidence, public.workers, public.movements,
  public.receive_photos, public.assignments, public.app_releases
  from anon, authenticated;

revoke insert, update, delete on
  public.tenants, public.tenant_members, public.site_settings, public.sync_state, public.audit_log,
  public.catalog_vehicles, public.catalog_leads,
  public.profiles, public.invites, public.categories, public.items, public.vehicles,
  public.boxes, public.box_lines, public.box_evidence, public.workers, public.movements,
  public.receive_photos, public.assignments, public.app_releases
  from anon;

-- Ãnico INSERT anon legÃ­timo (policy catalog_leads_insert_public).
grant insert on public.catalog_leads to anon;;
