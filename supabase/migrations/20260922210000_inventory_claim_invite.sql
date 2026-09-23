-- ensure_profile + claim_invite (onboarding bodega en Supabase Auth)

create or replace function public.ensure_profile(p_full_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
  v_uid uuid := auth.uid();
  v_tenant uuid := public.inv_tenant_rg();
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;
  insert into public.profiles (id, tenant_id, full_name, role, active)
  values (
    v_uid,
    v_tenant,
    coalesce(nullif(trim(p_full_name), ''), 'Encargado bodega'),
    'bodega',
    false
  )
  on conflict (id) do update
    set full_name = coalesce(nullif(trim(p_full_name), ''), public.profiles.full_name),
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.claim_invite(
  p_code text,
  p_full_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_row public.profiles;
  v_code text;
  v_uid uuid := auth.uid();
  v_tenant uuid := public.inv_tenant_rg();
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;
  v_code := upper(trim(coalesce(p_code, '')));
  if length(v_code) < 6 then
    raise exception 'Código de invitación inválido';
  end if;

  select * into v_invite
  from public.invites
  where tenant_id = v_tenant
    and code = v_code
    and used_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'El código no existe, ya se usó o expiró';
  end if;

  insert into public.profiles (id, tenant_id, full_name, role, active)
  values (
    v_uid,
    v_tenant,
    coalesce(nullif(trim(p_full_name), ''), 'Encargado bodega'),
    v_invite.role,
    true
  )
  on conflict (id) do update set
    tenant_id = v_tenant,
    full_name = coalesce(nullif(trim(p_full_name), ''), public.profiles.full_name),
    role = v_invite.role,
    active = true,
    updated_at = now()
  returning * into v_row;

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (v_tenant, v_uid, v_invite.role, true)
  on conflict (tenant_id, user_id) do update set
    role = excluded.role,
    active = true;

  update public.invites
  set used_at = now(), used_by = v_uid
  where id = v_invite.id;

  return v_row;
end;
$$;

-- Variantes invocables con service role (sin auth.uid): p_user_id explícito
create or replace function public.ensure_profile_for(
  p_user_id uuid,
  p_full_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
  v_tenant uuid := public.inv_tenant_rg();
begin
  insert into public.profiles (id, tenant_id, full_name, role, active)
  values (
    p_user_id,
    v_tenant,
    coalesce(nullif(trim(p_full_name), ''), 'Encargado bodega'),
    'bodega',
    false
  )
  on conflict (id) do update
    set full_name = coalesce(nullif(trim(p_full_name), ''), public.profiles.full_name),
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.claim_invite_for(
  p_user_id uuid,
  p_code text,
  p_full_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_row public.profiles;
  v_code text;
  v_tenant uuid := public.inv_tenant_rg();
begin
  v_code := upper(trim(coalesce(p_code, '')));
  if length(v_code) < 6 then
    raise exception 'Código de invitación inválido';
  end if;

  select * into v_invite
  from public.invites
  where tenant_id = v_tenant
    and code = v_code
    and used_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'El código no existe, ya se usó o expiró';
  end if;

  insert into public.profiles (id, tenant_id, full_name, role, active)
  values (
    p_user_id,
    v_tenant,
    coalesce(nullif(trim(p_full_name), ''), 'Encargado bodega'),
    v_invite.role,
    true
  )
  on conflict (id) do update set
    tenant_id = v_tenant,
    full_name = coalesce(nullif(trim(p_full_name), ''), public.profiles.full_name),
    role = v_invite.role,
    active = true,
    updated_at = now()
  returning * into v_row;

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (v_tenant, p_user_id, v_invite.role, true)
  on conflict (tenant_id, user_id) do update set
    role = excluded.role,
    active = true;

  update public.invites
  set used_at = now(), used_by = p_user_id
  where id = v_invite.id;

  return v_row;
end;
$$;

grant execute on function public.ensure_profile(text) to anon, authenticated, service_role;
grant execute on function public.claim_invite(text, text) to anon, authenticated, service_role;
grant execute on function public.ensure_profile_for(uuid, text) to anon, authenticated, service_role;
grant execute on function public.claim_invite_for(uuid, text, text) to anon, authenticated, service_role;
