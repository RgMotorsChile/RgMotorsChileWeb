-- Campos de patio para jefatura: proveedor, ubicaciÃ³n y observaciÃ³n.
-- Bodega no usa estos campos en la app.

alter table public.vehicles
  add column if not exists supplier text not null default '',
  add column if not exists location text not null default '',
  add column if not exists source text not null default '',
  add column if not exists note text not null default '',
  add column if not exists note_audio_path text;
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
  v_supplier text;
  v_location text;
  v_source text;
  v_note text;
  v_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
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
    v_supplier := nullif(trim(both from coalesce(v_elem->>'supplier', '')), '');
    v_location := nullif(trim(both from coalesce(v_elem->>'location', '')), '');
    v_source := nullif(trim(both from coalesce(v_elem->>'source', '')), '');
    v_note := nullif(trim(both from coalesce(v_elem->>'note', '')), '');
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
            source = coalesce(v_source, nullif(source, ''), ''),
            note = case
              when coalesce(nullif(trim(note), ''), '') = '' then coalesce(v_note, '')
              else note
            end,
            updated_at = now()
        where id = v_id;
      v_updated := v_updated + 1;
    else
      insert into public.vehicles (
        tenant_id, plate, brand, model, year, color, status, supplier, location, source, note
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
        coalesce(v_note, '')
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
create or replace function public.save_vehicle_observation(
  p_vehicle_id uuid,
  p_note text,
  p_audio_path text default null
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
        note_audio_path = coalesce(nullif(trim(coalesce(p_audio_path, '')), ''), note_audio_path),
        updated_at = now()
    where id = p_vehicle_id and tenant_id = v_tenant
    returning * into v_row;

  if not found then
    raise exception 'Unidad no encontrada';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.save_vehicle_observation(uuid, text, text) from anon, authenticated, public;
grant execute on function public.save_vehicle_observation(uuid, text, text) to service_role;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-notes',
  'vehicle-notes',
  false,
  20971520,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
