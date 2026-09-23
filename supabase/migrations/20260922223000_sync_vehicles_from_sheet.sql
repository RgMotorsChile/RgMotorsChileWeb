-- Sync patentes patio desde Sheet (tenant rg-motors)

create or replace function public.sync_vehicles_from_sheet(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
  v_plate text;
  v_norm text;
  v_brand text;
  v_model text;
  v_year integer;
  v_color text;
  v_status text;
  v_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_norms text[] := '{}';
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Se espera un arreglo JSON de unidades';
  end if;

  for v_elem in select value from jsonb_array_elements(p_rows)
  loop
    v_plate := trim(both from coalesce(v_elem->>'plate', ''));
    v_brand := trim(both from coalesce(v_elem->>'brand', ''));
    v_model := trim(both from coalesce(v_elem->>'model', ''));
    v_color := nullif(trim(both from coalesce(v_elem->>'color', '')), '');
    v_status := nullif(trim(both from coalesce(v_elem->>'status', '')), '');
    begin
      v_year := nullif(v_elem->>'year', '')::integer;
    exception when others then
      v_year := null;
    end;
    v_norm := upper(regexp_replace(v_plate, '[^A-Za-z0-9]', '', 'g'));

    if length(v_norm) < 5 or v_brand = '' or v_model = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_norms := array_append(v_norms, v_norm);
    select id into v_id
    from public.vehicles
    where tenant_id = v_tenant and plate_norm = v_norm;
    if found then
      update public.vehicles
        set plate = v_plate,
            brand = v_brand,
            model = v_model,
            year = coalesce(v_year, year),
            color = coalesce(v_color, color),
            status = coalesce(v_status, status),
            updated_at = now()
        where id = v_id;
      v_updated := v_updated + 1;
    else
      insert into public.vehicles (tenant_id, plate, brand, model, year, color, status)
      values (
        v_tenant,
        v_plate,
        v_brand,
        v_model,
        coalesce(v_year, extract(year from now())::int),
        coalesce(v_color, 'Sin color'),
        coalesce(v_status, 'Disponible')
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  insert into public.sync_state (tenant_id, key, synced_at, detail)
  values (
    v_tenant,
    'rg_motors_vehicles',
    now(),
    jsonb_build_object(
      'inserted', v_inserted,
      'updated', v_updated,
      'skipped', v_skipped,
      'read', jsonb_array_length(p_rows)
    )
  )
  on conflict (tenant_id, key) do update set
    synced_at = excluded.synced_at,
    detail = excluded.detail;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$$;

grant execute on function public.sync_vehicles_from_sheet(jsonb) to anon, authenticated, service_role;
