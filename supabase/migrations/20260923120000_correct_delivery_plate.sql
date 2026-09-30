-- Corregir patente de una entrega (24 h). No mueve stock.

create or replace function public.correct_delivery_plate(
  p_movement_id uuid,
  p_plate text,
  p_note text default null,
  p_actor_id uuid default null,
  p_actor_name text default null
)
returns public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_move public.movements;
  v_vehicle public.vehicles;
  v_old text;
  v_actor text;
  v_actor_id uuid;
  v_plate_norm text;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_movement_id is null then
    raise exception 'Falta la entrega a corregir';
  end if;

  select * into v_move
  from public.movements
  where id = p_movement_id and tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'No encontramos esa entrega';
  end if;
  if v_move.type not in ('uso', 'dano') then
    raise exception 'Solo se puede corregir una entrega a unidad';
  end if;
  if v_move.created_at < now() - interval '24 hours' then
    raise exception 'Solo se puede corregir durante las primeras 24 horas';
  end if;

  v_plate_norm := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_plate_norm = '' then
    raise exception 'Indica la patente correcta';
  end if;

  select * into v_vehicle
  from public.vehicles
  where tenant_id = v_tenant and plate_norm = v_plate_norm;
  if not found then
    raise exception 'No hay una unidad con esa patente. Jefatura debe cargarla en la web.';
  end if;

  v_old := coalesce(v_move.plate, '');
  if v_old <> '' and upper(regexp_replace(v_old, '[^A-Za-z0-9]', '', 'g')) = v_plate_norm then
    raise exception 'Esa entrega ya estÃ¡ en %', v_vehicle.plate;
  end if;

  v_actor_id := coalesce(p_actor_id, auth.uid());
  v_actor := coalesce(
    nullif(trim(p_actor_name), ''),
    (select full_name from public.profiles where id = v_actor_id),
    'Bodega'
  );

  update public.movements
  set
    vehicle_id = v_vehicle.id,
    plate = v_vehicle.plate,
    note = trim(both ' Â·' from concat_ws(
      ' Â· ',
      nullif(trim(coalesce(v_move.note, '')), ''),
      format('Corregido de %s a %s por %s', nullif(v_old, ''), v_vehicle.plate, v_actor),
      nullif(trim(coalesce(p_note, '')), '')
    ))
  where id = v_move.id and tenant_id = v_tenant
  returning * into v_move;

  insert into public.audit_log (tenant_id, actor_id, actor_name, action, entity, payload)
  values (
    v_tenant,
    v_actor_id,
    v_actor,
    'correct_delivery_plate',
    'movements',
    jsonb_build_object(
      'movement_id', v_move.id,
      'item_sku', v_move.item_sku,
      'from_plate', v_old,
      'to_plate', v_vehicle.plate,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return v_move;
end;
$$;
grant execute on function public.correct_delivery_plate(uuid, text, text, uuid, text) to anon, authenticated, service_role;
