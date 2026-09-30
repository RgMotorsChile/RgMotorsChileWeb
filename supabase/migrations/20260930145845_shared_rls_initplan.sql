-- P1-3 (auditorÃ­a 2026-09-30): auth.uid() y helpers envueltos en (select ...) para evaluarse una vez por consulta.
-- Misma semÃ¡ntica, mismos roles y comando (ALTER POLICY no cambia TO ni FOR). No toca policies de boletas (expenses/expense_profiles).
alter policy tenant_members_self_read on public.tenant_members
  using (user_id = (select auth.uid()));

alter policy inv_items_staff          on public.items          using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_vehicles_staff       on public.vehicles       using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_movements_staff      on public.movements      using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_boxes_staff          on public.boxes          using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_box_lines_staff      on public.box_lines      using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_box_evidence_staff   on public.box_evidence   using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_workers_staff        on public.workers        using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_assignments_staff    on public.assignments    using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_categories_staff     on public.categories     using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy inv_receive_photos_staff on public.receive_photos using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));
alter policy app_releases_staff_select on public.app_releases  using ((select public.is_inv_staff()) and tenant_id in (select public.current_tenant_ids()));

alter policy profiles_self on public.profiles
  using (id = (select auth.uid()) or (select public.current_inv_role()) = any (array['jefatura'::text, 'admin'::text]));;
