-- Completa endurecimiento post-auditorÃ­a Cloudflare (HUNT-AC-001/002, TEN-001/004).
-- Mutaciones inventario solo service_role (/api); staff JWT = SELECT.
-- Campos jefatura: sin UPDATE para anon/authenticated.
-- tenants: no filtrar sheet_id/drive/settings a anon.
-- catalog_vehicles write: sin rol jefatura de bodega.

-- ---------------------------------------------------------------------------
-- Inventory RLS: SELECT only for staff JWT
-- ---------------------------------------------------------------------------
drop policy if exists inv_items_staff on public.items;
create policy inv_items_staff on public.items
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_vehicles_staff on public.vehicles;
create policy inv_vehicles_staff on public.vehicles
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_movements_staff on public.movements;
create policy inv_movements_staff on public.movements
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_boxes_staff on public.boxes;
create policy inv_boxes_staff on public.boxes
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_box_lines_staff on public.box_lines;
create policy inv_box_lines_staff on public.box_lines
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_box_evidence_staff on public.box_evidence;
create policy inv_box_evidence_staff on public.box_evidence
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_workers_staff on public.workers;
create policy inv_workers_staff on public.workers
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_assignments_staff on public.assignments;
create policy inv_assignments_staff on public.assignments
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_categories_staff on public.categories;
create policy inv_categories_staff on public.categories
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
drop policy if exists inv_receive_photos_staff on public.receive_photos;
create policy inv_receive_photos_staff on public.receive_photos
  for select using (
    public.is_inv_staff() and tenant_id in (select public.current_tenant_ids())
  );
-- ---------------------------------------------------------------------------
-- Column privileges: jefatura fields not updatable by JWT roles
-- ---------------------------------------------------------------------------
revoke update (note, note_audio_path, supplier, location, source, purchase_lot)
  on table public.vehicles
  from anon, authenticated, public;
revoke select (sheet_id, drive_folder_id, settings)
  on table public.tenants
  from anon, authenticated, public;
-- ---------------------------------------------------------------------------
-- catalog_vehicles: jefatura bodega no escribe catÃ¡logo web
-- ---------------------------------------------------------------------------
drop policy if exists catalog_vehicles_member_write on public.catalog_vehicles;
create policy catalog_vehicles_member_write on public.catalog_vehicles
  for all using (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin'])
  )
  with check (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin'])
  );
