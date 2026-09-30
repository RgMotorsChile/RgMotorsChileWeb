-- P1-4 (auditorÃ­a 2026-09-30): Ã­ndices para FK sin cobertura. Excluye public.expenses/expense_profiles (boletas, en migraciÃ³n a su propio esquema).
create index if not exists movements_vehicle_id_idx       on public.movements (vehicle_id);
create index if not exists movements_worker_id_idx        on public.movements (worker_id);
create index if not exists movements_box_id_idx           on public.movements (box_id);
create index if not exists movements_user_id_idx          on public.movements (user_id);
create index if not exists movements_tenant_sku_idx       on public.movements (tenant_id, item_sku);
create index if not exists box_lines_box_id_idx           on public.box_lines (box_id);
create index if not exists box_lines_tenant_sku_idx       on public.box_lines (tenant_id, item_sku);
create index if not exists box_evidence_box_id_idx        on public.box_evidence (box_id);
create index if not exists box_evidence_tenant_idx        on public.box_evidence (tenant_id);
create index if not exists receive_photos_movement_id_idx on public.receive_photos (movement_id);
create index if not exists receive_photos_tenant_sku_idx  on public.receive_photos (tenant_id, item_sku);
create index if not exists assignments_worker_id_idx      on public.assignments (worker_id);
create index if not exists assignments_tenant_sku_idx     on public.assignments (tenant_id, item_sku);
create index if not exists profiles_tenant_id_idx         on public.profiles (tenant_id);
create index if not exists audit_log_tenant_created_idx   on public.audit_log (tenant_id, created_at desc);;
