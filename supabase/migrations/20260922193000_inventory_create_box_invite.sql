-- create_box + create_invite (panel web inventario)

create or replace function public.create_box(
  p_code text,
  p_barcode text,
  p_supplier text,
  p_guide text,
  p_lines jsonb
)
returns public.boxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.boxes;
  v_line jsonb;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'La caja debe tener al menos una línea';
  end if;

  insert into public.boxes (tenant_id, code, barcode, supplier, guide)
  values (v_tenant, trim(p_code), trim(p_barcode), trim(p_supplier), trim(p_guide))
  returning * into v_box;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if not exists (
      select 1 from public.items
      where tenant_id = v_tenant and sku = v_line ->> 'sku'
    ) then
      raise exception 'SKU % no existe', v_line ->> 'sku';
    end if;
    insert into public.box_lines (box_id, tenant_id, item_sku, qty)
    values (
      v_box.id,
      v_tenant,
      v_line ->> 'sku',
      greatest(1, coalesce((v_line ->> 'qty')::int, 1))
    );
  end loop;

  return v_box;
end;
$$;

create or replace function public.create_invite(
  p_email text default null,
  p_role text default 'bodega'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_role not in ('bodega', 'jefatura') then
    raise exception 'Rol inválido';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.invites (tenant_id, code, email, role)
  values (
    v_tenant,
    v_code,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    p_role
  );
  return v_code;
end;
$$;

grant execute on function public.create_box(text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.create_invite(text, text) to anon, authenticated, service_role;
