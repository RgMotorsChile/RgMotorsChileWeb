-- Compras Santiago: lote/mes, sync aparte, no pisar observaciÃ³n ni origen de patio.
-- Borrar observaciÃ³n tambiÃ©n limpia el audio.

alter table public.vehicles
  add column if not exists purchase_lot text not null default '';
revoke select (purchase_lot)
  on table public.vehicles
  from anon, authenticated, public;
drop function if exists public.sync_vehicles_from_sheet(jsonb);
create or replace function public.sync_vehicles_from_sheet(
  p_rows jsonb,
  p_sync_key text default 'rg_motors_vehicles'
)
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
  v_supplier text;
  v_location text;
  v_source text;
  v_lot text;
  v_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_tenant uuid := public.inv_tenant_rg();
  v_key text := nullif(trim(both from coalesce(p_sync_key, '')), '');
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Se espera un arreglo JSON de unidades';
  end if;
  if v_key is null then
    v_key := 'rg_motors_vehicles';
  end if;

  for v_elem in select value from jsonb_array_elements(p_rows)
  loop
    v_plate := trim(both from coalesce(v_elem->>'plate', ''));
    v_brand := trim(both from coalesce(v_elem->>'brand', ''));
    v_model := trim(both from coalesce(v_elem->>'model', ''));
    v_color := nullif(trim(both from coalesce(v_elem->>'color', '')), '');
    v_status := nullif(trim(both from coalesce(v_elem->>'status', '')), '');
    v_supplier := nullif(trim(both from coalesce(v_elem->>'supplier', '')), '');
    v_location := nullif(trim(both from coalesce(v_elem->>'location', '')), '');
    v_source := nullif(trim(both from coalesce(v_elem->>'source', '')), '');
    v_lot := nullif(trim(both from coalesce(v_elem->>'purchase_lot', '')), '');
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
            supplier = coalesce(v_supplier, nullif(supplier, ''), ''),
            location = coalesce(v_location, nullif(location, ''), ''),
            source = case
              when v_source ilike 'Santiago%'
                and source <> ''
                and source not ilike 'Santiago%'
              then source
              else coalesce(v_source, nullif(source, ''), '')
            end,
            purchase_lot = coalesce(v_lot, nullif(purchase_lot, ''), ''),
            updated_at = now()
        where id = v_id;
      v_updated := v_updated + 1;
    else
      insert into public.vehicles (
        tenant_id, plate, brand, model, year, color, status, supplier, location, source, purchase_lot, note
      )
      values (
        v_tenant,
        v_plate,
        v_brand,
        v_model,
        coalesce(v_year, extract(year from now())::int),
        coalesce(v_color, 'Sin color'),
        coalesce(v_status, 'Disponible'),
        coalesce(v_supplier, ''),
        coalesce(v_location, ''),
        coalesce(v_source, ''),
        coalesce(v_lot, ''),
        trim(both from coalesce(v_elem->>'note', ''))
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  insert into public.sync_state (tenant_id, key, synced_at, detail)
  values (
    v_tenant,
    v_key,
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
drop function if exists public.save_vehicle_observation(uuid, text, text);
drop function if exists public.save_vehicle_observation(uuid, text, text, boolean);
create or replace function public.save_vehicle_observation(
  p_vehicle_id uuid,
  p_note text,
  p_audio_path text default null,
  p_clear_audio boolean default false
)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_vehicle_id is null then
    raise exception 'Falta la unidad';
  end if;

  update public.vehicles
    set note = trim(coalesce(p_note, '')),
        note_audio_path = case
          when p_clear_audio then null
          else coalesce(nullif(trim(coalesce(p_audio_path, '')), ''), note_audio_path)
        end,
        updated_at = now()
    where id = p_vehicle_id and tenant_id = v_tenant
    returning * into v_row;

  if not found then
    raise exception 'Unidad no encontrada';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.save_vehicle_observation(uuid, text, text, boolean)
  from anon, authenticated, public;
grant execute on function public.save_vehicle_observation(uuid, text, text, boolean)
  to service_role;
