-- RPCs inventario multi-tenant (cutover desde InsForge)
-- Auth de app sigue en InsForge; estas funciones son security definer
-- y se invocan desde el servidor con service role (o vía /api/rpc).

create or replace function public.inv_tenant_rg()
returns uuid
language sql
immutable
as $$
  select '26291b1f-2133-4ea0-8b5e-83765c357771'::uuid;
$$;

create or replace function public.upsert_category(p_name text)
returns public.categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.categories;
  v_tenant uuid := public.inv_tenant_rg();
begin
  insert into public.categories (tenant_id, name)
  values (v_tenant, trim(p_name))
  on conflict (tenant_id, name) do update set name = excluded.name
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.upsert_item(
  p_sku text,
  p_name text,
  p_category text,
  p_brand text,
  p_min_stock integer,
  p_location text,
  p_unit_cost numeric,
  p_compatible text default ''
)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_tenant uuid := public.inv_tenant_rg();
begin
  insert into public.items (
    tenant_id, sku, name, category, brand, min_stock, location, unit_cost, compatible
  )
  values (
    v_tenant,
    upper(trim(p_sku)),
    p_name,
    p_category,
    p_brand,
    coalesce(p_min_stock, 0),
    p_location,
    coalesce(p_unit_cost, 0),
    coalesce(p_compatible, '')
  )
  on conflict (tenant_id, sku) do update set
    name = excluded.name,
    category = excluded.category,
    brand = excluded.brand,
    min_stock = excluded.min_stock,
    location = excluded.location,
    unit_cost = excluded.unit_cost,
    compatible = excluded.compatible,
    updated_at = now()
  returning * into v_item;
  return v_item;
end;
$$;

create or replace function public.adjust_stock(
  p_sku text,
  p_qty integer,
  p_note text
)
returns public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_move public.movements;
  v_qty integer;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_qty is null or p_qty = 0 then
    raise exception 'La cantidad no puede ser 0';
  end if;

  select * into v_item from public.items
  where tenant_id = v_tenant and sku = p_sku
  for update;
  if not found then
    raise exception 'El SKU no existe';
  end if;
  if v_item.stock + p_qty < 0 then
    raise exception 'El ajuste dejaría stock negativo';
  end if;

  update public.items
  set stock = stock + p_qty, updated_at = now()
  where tenant_id = v_tenant and sku = p_sku;
  v_qty := abs(p_qty);

  insert into public.movements (tenant_id, type, item_sku, qty, note, user_name)
  values (
    v_tenant,
    'ajuste',
    p_sku,
    v_qty,
    coalesce(p_note, format('Ajuste %s', p_qty)),
    'Jefatura'
  )
  returning * into v_move;
  return v_move;
end;
$$;

create or replace function public.upsert_vehicle(
  p_plate text,
  p_brand text,
  p_model text,
  p_year integer,
  p_color text,
  p_status text default 'Disponible'
)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles;
  v_tenant uuid := public.inv_tenant_rg();
  v_plate text := trim(coalesce(p_plate, ''));
begin
  if upper(regexp_replace(v_plate, '[^A-Za-z0-9]', '', 'g')) = '' then
    raise exception 'La patente es obligatoria';
  end if;
  insert into public.vehicles (tenant_id, plate, brand, model, year, color, status)
  values (v_tenant, v_plate, p_brand, p_model, p_year, p_color, coalesce(nullif(trim(p_status), ''), 'Disponible'))
  on conflict (tenant_id, plate_norm) do update set
    plate = excluded.plate,
    brand = excluded.brand,
    model = excluded.model,
    year = excluded.year,
    color = excluded.color,
    status = excluded.status,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.upsert_worker(
  p_full_name text,
  p_active boolean default true,
  p_id uuid default null,
  p_job_title text default 'Taller'
)
returns public.workers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workers;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_id is not null then
    update public.workers
    set full_name = trim(p_full_name),
        job_title = coalesce(nullif(trim(p_job_title), ''), job_title),
        active = coalesce(p_active, true),
        updated_at = now()
    where id = p_id and tenant_id = v_tenant
    returning * into v_row;
    if found then return v_row; end if;
  end if;
  insert into public.workers (tenant_id, full_name, job_title, active)
  values (
    v_tenant,
    trim(p_full_name),
    coalesce(nullif(trim(p_job_title), ''), 'Taller'),
    coalesce(p_active, true)
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.delete_worker(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.workers
  where id = p_id and tenant_id = public.inv_tenant_rg();
end;
$$;

grant execute on function public.upsert_category(text) to anon, authenticated, service_role;
grant execute on function public.upsert_item(text, text, text, text, integer, text, numeric, text) to anon, authenticated, service_role;
grant execute on function public.adjust_stock(text, integer, text) to anon, authenticated, service_role;
grant execute on function public.upsert_vehicle(text, text, text, integer, text, text) to anon, authenticated, service_role;
grant execute on function public.upsert_worker(text, boolean, uuid, text) to anon, authenticated, service_role;
grant execute on function public.delete_worker(uuid) to anon, authenticated, service_role;
