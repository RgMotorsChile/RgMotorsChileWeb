-- Bucket privado de evidencias de bodega + RLS tablas relacionadas

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'box-evidence',
  'box-evidence',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists box_evidence_staff_select on storage.objects;
create policy box_evidence_staff_select on storage.objects
  for select to authenticated
  using (bucket_id = 'box-evidence' and public.is_inv_staff());

drop policy if exists box_evidence_staff_insert on storage.objects;
create policy box_evidence_staff_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'box-evidence' and public.is_inv_staff());

drop policy if exists box_evidence_staff_update on storage.objects;
create policy box_evidence_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'box-evidence' and public.is_inv_staff())
  with check (bucket_id = 'box-evidence' and public.is_inv_staff());

drop policy if exists box_evidence_staff_delete on storage.objects;
create policy box_evidence_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'box-evidence' and public.is_inv_staff());

-- Tablas de metadatos (antes solo RLS on, sin policies)
drop policy if exists inv_boxes_staff on public.boxes;
create policy inv_boxes_staff on public.boxes
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_box_lines_staff on public.box_lines;
create policy inv_box_lines_staff on public.box_lines
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_box_evidence_staff on public.box_evidence;
create policy inv_box_evidence_staff on public.box_evidence
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_receive_photos_staff on public.receive_photos;
create policy inv_receive_photos_staff on public.receive_photos
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_workers_staff on public.workers;
create policy inv_workers_staff on public.workers
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_assignments_staff on public.assignments;
create policy inv_assignments_staff on public.assignments
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_categories_staff on public.categories;
create policy inv_categories_staff on public.categories
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));
