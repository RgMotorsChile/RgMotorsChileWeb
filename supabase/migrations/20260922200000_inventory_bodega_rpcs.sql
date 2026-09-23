-- RPCs bodega (app móvil + panel). tenant rg-motors. security definer (gate en /api).

create or replace function public.use_item(
  p_sku text,
  p_qty integer,
  p_plate text,
  p_note text default null
)
returns public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_vehicle public.vehicles;
  v_move public.movements;
  v_plate_norm text;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;

  v_plate_norm := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_plate_norm = '' then
    raise exception 'Debes indicar la patente de la unidad';
  end if;

  select * into v_vehicle
  from public.vehicles
  where tenant_id = v_tenant and plate_norm = v_plate_norm;
  if not found then
    raise exception 'No hay una unidad con esa patente en el patio';
  end if;

  select * into v_item from public.items
  where tenant_id = v_tenant and sku = p_sku
  for update;
  if not found then
    raise exception 'El SKU no existe';
  end if;
  if v_item.stock < p_qty then
    raise exception 'Stock insuficiente: hay % y pediste %', v_item.stock, p_qty;
  end if;

  update public.items
  set stock = stock - p_qty, updated_at = now()
  where tenant_id = v_tenant and sku = p_sku;

  insert into public.movements (
    tenant_id, type, item_sku, qty, vehicle_id, plate, note, user_name
  ) values (
    v_tenant, 'uso', p_sku, p_qty, v_vehicle.id, v_vehicle.plate, p_note, 'Bodega'
  )
  returning * into v_move;
  return v_move;
end;
$$;

create or replace function public.deliver_item(
  p_sku text,
  p_qty integer,
  p_worker_id uuid,
  p_plate text default null,
  p_outcome text default 'instalado',
  p_note text default null
)
returns public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_vehicle public.vehicles;
  v_worker public.workers;
  v_move public.movements;
  v_plate_norm text;
  v_type text;
  v_note text;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;
  if coalesce(p_outcome, '') not in ('instalado', 'usado', 'danado', 'extraviado') then
    raise exception 'Indica qué pasó: instalado, usado, dañado o extraviado';
  end if;

  select * into v_worker
  from public.workers
  where tenant_id = v_tenant and id = p_worker_id and active;
  if not found then
    raise exception 'Elige el trabajador que recibió o instaló el elemento';
  end if;

  v_plate_norm := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_plate_norm <> '' then
    select * into v_vehicle
    from public.vehicles
    where tenant_id = v_tenant and plate_norm = v_plate_norm;
    if not found then
      raise exception 'No hay una unidad con esa patente. Jefatura debe cargarla en la web.';
    end if;
  elsif p_outcome in ('instalado', 'usado') and coalesce(trim(p_note), '') = '' then
    raise exception 'Si no es un vehículo, escribe en qué se usó el elemento';
  end if;

  select * into v_item from public.items
  where tenant_id = v_tenant and sku = p_sku
  for update;
  if not found then
    raise exception 'El SKU no existe';
  end if;
  if v_item.stock < p_qty then
    raise exception 'Stock insuficiente: hay % y pediste %', v_item.stock, p_qty;
  end if;

  update public.items
  set stock = stock - p_qty, updated_at = now()
  where tenant_id = v_tenant and sku = p_sku;

  v_type := case when p_outcome in ('danado', 'extraviado') then 'dano' else 'uso' end;
  v_note := trim(coalesce(p_note, ''));
  if v_note = '' then
    v_note := case p_outcome
      when 'instalado' then format('Instalado por %s', v_worker.full_name)
      when 'usado' then format('Usado por %s', v_worker.full_name)
      when 'danado' then format('Dañado · %s', v_worker.full_name)
      else format('Extraviado · %s', v_worker.full_name)
    end;
  end if;

  insert into public.movements (
    tenant_id, type, item_sku, qty, vehicle_id, plate, worker_id, worker_name, note, outcome, user_name
  ) values (
    v_tenant, v_type, p_sku, p_qty, v_vehicle.id, v_vehicle.plate,
    v_worker.id, v_worker.full_name, v_note, p_outcome, 'Bodega'
  )
  returning * into v_move;
  return v_move;
end;
$$;

create or replace function public.receive_item(
  p_sku text,
  p_qty integer,
  p_note text default null
)
returns public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_move public.movements;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;

  update public.items
  set stock = stock + p_qty, updated_at = now()
  where tenant_id = v_tenant and sku = p_sku;
  if not found then
    raise exception 'El SKU no existe';
  end if;

  insert into public.movements (tenant_id, type, item_sku, qty, note, user_name)
  values (v_tenant, 'ingreso', p_sku, p_qty, p_note, 'Bodega')
  returning * into v_move;
  return v_move;
end;
$$;

create or replace function public.receive_stock(
  p_qty integer,
  p_sku text default null,
  p_name text default null,
  p_category text default 'General',
  p_note text default null
)
returns public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_move public.movements;
  v_sku text;
  v_name text;
  v_cat text;
  v_base text;
  v_n integer := 1;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;

  v_sku := upper(trim(coalesce(p_sku, '')));
  v_name := trim(coalesce(p_name, ''));

  if v_sku <> '' then
    select * into v_item from public.items
    where tenant_id = v_tenant and sku = v_sku
    for update;
  elsif v_name <> '' then
    select * into v_item
    from public.items
    where tenant_id = v_tenant and lower(name) = lower(v_name)
    order by created_at
    limit 1
    for update;
  else
    raise exception 'Elige un elemento o escribe el nombre de lo que llegó';
  end if;

  if not found then
    if v_name = '' then
      raise exception 'El SKU no existe';
    end if;
    v_base := upper(left(regexp_replace(v_name, '[^A-Za-z0-9]+', '-', 'g'), 20));
    v_base := trim(both '-' from v_base);
    if v_base = '' then
      v_base := 'ITEM';
    end if;
    v_sku := v_base;
    while exists (
      select 1 from public.items where tenant_id = v_tenant and sku = v_sku
    ) loop
      v_n := v_n + 1;
      v_sku := v_base || '-' || v_n;
    end loop;

    v_cat := coalesce(nullif(trim(coalesce(p_category, '')), ''), 'General');
    insert into public.categories (tenant_id, name)
    values (v_tenant, v_cat)
    on conflict (tenant_id, name) do nothing;
    insert into public.items (
      tenant_id, sku, name, category, brand, stock, min_stock, location, unit_cost, compatible
    ) values (
      v_tenant, v_sku, v_name, v_cat, '', 0, 0, 'Bodega', 0, ''
    )
    returning * into v_item;
  end if;

  update public.items
  set stock = stock + p_qty, updated_at = now()
  where tenant_id = v_tenant and sku = v_item.sku;

  insert into public.movements (tenant_id, type, item_sku, qty, note, user_name)
  values (
    v_tenant,
    'ingreso',
    v_item.sku,
    p_qty,
    coalesce(p_note, format('Ingreso %s', v_item.name)),
    'Bodega'
  )
  returning * into v_move;
  return v_move;
end;
$$;

create or replace function public.receive_box(
  p_code text,
  p_skipped text[] default '{}'
)
returns public.boxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.boxes;
  v_line public.box_lines;
  v_tenant uuid := public.inv_tenant_rg();
begin
  select * into v_box
  from public.boxes
  where tenant_id = v_tenant and (code = p_code or barcode = p_code)
  for update;

  if not found then
    raise exception 'No existe una caja con ese código';
  end if;
  if v_box.received_at is not null then
    raise exception 'Esta caja ya fue ingresada';
  end if;

  for v_line in
    select * from public.box_lines where box_id = v_box.id and tenant_id = v_tenant
  loop
    if p_skipped is not null and v_line.item_sku = any (p_skipped) then
      continue;
    end if;

    update public.items
    set stock = stock + v_line.qty, updated_at = now()
    where tenant_id = v_tenant and sku = v_line.item_sku;

    insert into public.movements (tenant_id, type, item_sku, qty, box_id, note, user_name)
    values (
      v_tenant, 'ingreso', v_line.item_sku, v_line.qty, v_box.id,
      format('Caja %s · %s', v_box.code, v_box.supplier),
      'Bodega'
    );
  end loop;

  update public.boxes
  set received_at = now(), updated_at = now()
  where id = v_box.id
  returning * into v_box;
  return v_box;
end;
$$;

create or replace function public.attach_box_evidence(
  p_box_id uuid,
  p_storage_path text
)
returns public.box_evidence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.box_evidence;
  v_tenant uuid := public.inv_tenant_rg();
begin
  insert into public.box_evidence (box_id, tenant_id, storage_path)
  values (p_box_id, v_tenant, p_storage_path)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.attach_receive_photo(
  p_movement_id uuid,
  p_sku text,
  p_qty integer,
  p_storage_path text
)
returns public.receive_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.receive_photos;
  v_tenant uuid := public.inv_tenant_rg();
begin
  insert into public.receive_photos (
    tenant_id, movement_id, item_sku, qty, storage_path
  ) values (
    v_tenant, p_movement_id, p_sku, greatest(1, coalesce(p_qty, 1)), p_storage_path
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.assign_item(
  p_sku text,
  p_qty integer,
  p_worker_id uuid,
  p_note text default null
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items;
  v_worker public.workers;
  v_asg public.assignments;
  v_tenant uuid := public.inv_tenant_rg();
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;

  select * into v_worker
  from public.workers
  where tenant_id = v_tenant and id = p_worker_id and active;
  if not found then
    raise exception 'El trabajador no existe o está inactivo';
  end if;

  select * into v_item from public.items
  where tenant_id = v_tenant and sku = p_sku
  for update;
  if not found then
    raise exception 'El SKU no existe';
  end if;
  if v_item.stock < p_qty then
    raise exception 'Stock insuficiente: hay % y pediste %', v_item.stock, p_qty;
  end if;

  update public.items
  set stock = stock - p_qty, updated_at = now()
  where tenant_id = v_tenant and sku = p_sku;

  insert into public.assignments (tenant_id, item_sku, qty, worker_id, note)
  values (v_tenant, p_sku, p_qty, v_worker.id, p_note)
  returning * into v_asg;

  insert into public.movements (
    tenant_id, type, item_sku, qty, worker_id, worker_name, note, user_name
  ) values (
    v_tenant, 'asignacion', p_sku, p_qty, v_worker.id, v_worker.full_name,
    coalesce(p_note, format('Asignado a %s', v_worker.full_name)),
    'Bodega'
  );

  return v_asg;
end;
$$;

create or replace function public.return_assignment(
  p_assignment_id uuid,
  p_note text default null
)
returns public.assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asg public.assignments;
  v_worker public.workers;
  v_tenant uuid := public.inv_tenant_rg();
begin
  select * into v_asg
  from public.assignments
  where tenant_id = v_tenant and id = p_assignment_id
  for update;
  if not found then
    raise exception 'La asignación no existe';
  end if;
  if v_asg.status <> 'abierta' then
    raise exception 'Esta asignación ya fue cerrada';
  end if;

  select * into v_worker from public.workers where id = v_asg.worker_id;
  update public.items
  set stock = stock + v_asg.qty, updated_at = now()
  where tenant_id = v_tenant and sku = v_asg.item_sku;
  update public.assignments
    set status = 'devuelta', returned_at = now(), note = coalesce(p_note, note)
    where id = v_asg.id
    returning * into v_asg;

  insert into public.movements (
    tenant_id, type, item_sku, qty, worker_id, worker_name, note, user_name
  ) values (
    v_tenant, 'devolucion', v_asg.item_sku, v_asg.qty, v_asg.worker_id, v_worker.full_name,
    coalesce(p_note, format('Devolución de %s', v_worker.full_name)),
    'Bodega'
  );

  return v_asg;
end;
$$;

grant execute on function public.use_item(text, integer, text, text) to anon, authenticated, service_role;
grant execute on function public.deliver_item(text, integer, uuid, text, text, text) to anon, authenticated, service_role;
grant execute on function public.receive_item(text, integer, text) to anon, authenticated, service_role;
grant execute on function public.receive_stock(integer, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.receive_box(text, text[]) to anon, authenticated, service_role;
grant execute on function public.attach_box_evidence(uuid, text) to anon, authenticated, service_role;
grant execute on function public.attach_receive_photo(uuid, text, integer, text) to anon, authenticated, service_role;
grant execute on function public.assign_item(text, integer, uuid, text) to anon, authenticated, service_role;
grant execute on function public.return_assignment(uuid, text) to anon, authenticated, service_role;
