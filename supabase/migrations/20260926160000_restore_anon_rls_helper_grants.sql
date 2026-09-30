-- Anon debe poder EJECUTAR helpers usados en policies RLS al hacer SELECT.
-- Sin esto, PostgREST falla al evaluar catalog_vehicles_member_write (FOR ALL)
-- aunque exista catalog_vehicles_public_read â catÃ¡logo vacÃ­o / fallback IDB (pocos autos).

grant execute on function public.has_tenant_role(uuid, text[])
  to anon, authenticated, service_role;
grant execute on function public.current_tenant_ids()
  to anon, authenticated, service_role;
grant execute on function public.is_inv_staff()
  to anon, authenticated, service_role;
grant execute on function public.current_inv_role()
  to anon, authenticated, service_role;
grant execute on function public.inv_tenant_rg()
  to anon, authenticated, service_role;
-- Evitar que SELECT anÃ³nimo evalÃºe la policy de escritura (FOR ALL).
drop policy if exists catalog_vehicles_member_write on public.catalog_vehicles;
create policy catalog_vehicles_member_insert on public.catalog_vehicles
  for insert
  with check (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin'])
  );
create policy catalog_vehicles_member_update on public.catalog_vehicles
  for update
  using (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin'])
  )
  with check (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin'])
  );
create policy catalog_vehicles_member_delete on public.catalog_vehicles
  for delete
  using (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin'])
  );
