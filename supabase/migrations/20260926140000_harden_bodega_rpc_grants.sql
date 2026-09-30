-- Endurecimiento: RPCs bodega SECURITY DEFINER solo vÃ­a service_role (/api).
-- Flutter login sigue llamando claim_invite / ensure_profile con JWT (authenticated).
-- Variantes *_for y sync/CRUD mutadores: solo service_role.

-- ---------------------------------------------------------------------------
-- Helper inv_tenant_rg: search_path fijo (advisor WARN)
-- ---------------------------------------------------------------------------
create or replace function public.inv_tenant_rg()
returns uuid
language sql
immutable
set search_path = public
as $$
  select '26291b1f-2133-4ea0-8b5e-83765c357771'::uuid;
$$;
-- ---------------------------------------------------------------------------
-- Bodega mutators â service_role only
-- ---------------------------------------------------------------------------
revoke execute on function public.use_item(text, integer, text, text)
  from anon, authenticated, public;
grant execute on function public.use_item(text, integer, text, text)
  to service_role;
revoke execute on function public.deliver_item(text, integer, uuid, text, text, text)
  from anon, authenticated, public;
grant execute on function public.deliver_item(text, integer, uuid, text, text, text)
  to service_role;
revoke execute on function public.receive_item(text, integer, text)
  from anon, authenticated, public;
grant execute on function public.receive_item(text, integer, text)
  to service_role;
revoke execute on function public.receive_stock(integer, text, text, text, text)
  from anon, authenticated, public;
grant execute on function public.receive_stock(integer, text, text, text, text)
  to service_role;
revoke execute on function public.receive_box(text, text[])
  from anon, authenticated, public;
grant execute on function public.receive_box(text, text[])
  to service_role;
revoke execute on function public.attach_box_evidence(uuid, text)
  from anon, authenticated, public;
grant execute on function public.attach_box_evidence(uuid, text)
  to service_role;
revoke execute on function public.attach_receive_photo(uuid, text, integer, text)
  from anon, authenticated, public;
grant execute on function public.attach_receive_photo(uuid, text, integer, text)
  to service_role;
revoke execute on function public.assign_item(text, integer, uuid, text)
  from anon, authenticated, public;
grant execute on function public.assign_item(text, integer, uuid, text)
  to service_role;
revoke execute on function public.return_assignment(uuid, text)
  from anon, authenticated, public;
grant execute on function public.return_assignment(uuid, text)
  to service_role;
revoke execute on function public.create_box(text, text, text, text, jsonb)
  from anon, authenticated, public;
grant execute on function public.create_box(text, text, text, text, jsonb)
  to service_role;
revoke execute on function public.create_invite(text, text)
  from anon, authenticated, public;
grant execute on function public.create_invite(text, text)
  to service_role;
revoke execute on function public.upsert_category(text)
  from anon, authenticated, public;
grant execute on function public.upsert_category(text)
  to service_role;
revoke execute on function public.upsert_item(text, text, text, text, integer, text, numeric, text)
  from anon, authenticated, public;
grant execute on function public.upsert_item(text, text, text, text, integer, text, numeric, text)
  to service_role;
revoke execute on function public.adjust_stock(text, integer, text)
  from anon, authenticated, public;
grant execute on function public.adjust_stock(text, integer, text)
  to service_role;
revoke execute on function public.upsert_vehicle(text, text, text, integer, text, text)
  from anon, authenticated, public;
grant execute on function public.upsert_vehicle(text, text, text, integer, text, text)
  to service_role;
revoke execute on function public.upsert_worker(text, boolean, uuid, text)
  from anon, authenticated, public;
grant execute on function public.upsert_worker(text, boolean, uuid, text)
  to service_role;
revoke execute on function public.delete_worker(uuid)
  from anon, authenticated, public;
grant execute on function public.delete_worker(uuid)
  to service_role;
revoke execute on function public.sync_vehicles_from_sheet(jsonb, text)
  from anon, authenticated, public;
grant execute on function public.sync_vehicles_from_sheet(jsonb, text)
  to service_role;
-- correct_delivery_plate ya estaba locked; reafirmar
revoke execute on function public.correct_delivery_plate(uuid, text, text, uuid, text)
  from anon, authenticated, public;
grant execute on function public.correct_delivery_plate(uuid, text, text, uuid, text)
  to service_role;
-- ---------------------------------------------------------------------------
-- Onboarding: JWT user â claim_invite / ensure_profile (authenticated OK)
-- Variantes *_for: solo service_role (impersonaciÃ³n por user_id)
-- ---------------------------------------------------------------------------
revoke execute on function public.ensure_profile(text)
  from anon, public;
grant execute on function public.ensure_profile(text)
  to authenticated, service_role;
revoke execute on function public.claim_invite(text, text)
  from anon, public;
grant execute on function public.claim_invite(text, text)
  to authenticated, service_role;
revoke execute on function public.ensure_profile_for(uuid, text)
  from anon, authenticated, public;
grant execute on function public.ensure_profile_for(uuid, text)
  to service_role;
revoke execute on function public.claim_invite_for(uuid, text, text)
  from anon, authenticated, public;
grant execute on function public.claim_invite_for(uuid, text, text)
  to service_role;
-- ---------------------------------------------------------------------------
-- RLS perf: profiles_self con (select auth.uid())
-- ---------------------------------------------------------------------------
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select
  using (
    id = (select auth.uid())
    or public.current_inv_role() in ('jefatura', 'admin')
  );
