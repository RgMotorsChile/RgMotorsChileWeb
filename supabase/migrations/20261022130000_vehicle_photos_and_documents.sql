-- Fotos de vehículos en Supabase Storage y documentos que antes vivían en Vercel KV.
-- Idempotente. Correr en el SQL editor del proyecto tuybpizjeszgwtcvunmp.
-- No usar `supabase db push` contra la base compartida (el historial viejo ya está aplicado).
--
-- Escritura: solo service role (omite RLS). anon y authenticated no tienen policies de escritura.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vehicle_photos_public_read on storage.objects;
create policy vehicle_photos_public_read on storage.objects
  for select
  to public
  using (bucket_id = 'vehicle-photos');

-- Sin insert/update/delete para anon ni authenticated.
drop policy if exists vehicle_photos_anon_insert on storage.objects;
drop policy if exists vehicle_photos_anon_update on storage.objects;
drop policy if exists vehicle_photos_anon_delete on storage.objects;
drop policy if exists vehicle_photos_authenticated_insert on storage.objects;
drop policy if exists vehicle_photos_authenticated_update on storage.objects;
drop policy if exists vehicle_photos_authenticated_delete on storage.objects;

-- JSON que antes estaba en Vercel KV (estado del sync, leads, ajustes, vendidos).
create table if not exists public.app_documents (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_documents enable row level security;
revoke all on table public.app_documents from anon, authenticated;

-- Cupos de rate limit (reemplaza INCR/EXPIRE de KV).
create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;

create or replace function public.rate_limit_hit(bucket_key text, window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
  window_secs integer := greatest(1, coalesce(window_seconds, 60));
begin
  insert into public.rate_limit_buckets as b (key, count, reset_at)
  values (bucket_key, 1, now() + make_interval(secs => window_secs))
  on conflict (key) do update set
    count = case when b.reset_at <= now() then 1 else b.count + 1 end,
    reset_at = case
      when b.reset_at <= now() then now() + make_interval(secs => window_secs)
      else b.reset_at
    end
  returning count into new_count;
  return new_count;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;

-- Mismo esquema que UnidadesChile (PR #10, migración 20261022120000).
-- IF NOT EXISTS: si el otro repo ya creó la tabla, este SQL no la pisa.
-- El job de huérfanos de este repo lee purged_at is null, reintenta el borrado
-- y setea purged_at. reason: sold | deleted | removed | replaced.
create table if not exists public.vehicle_photo_orphans (
  bucket text not null default 'vehicle-photos',
  object_path text not null,
  tenant_slug text not null,
  vehicle_slug text not null default '',
  public_url text not null default '',
  reason text not null check (reason in ('sold', 'deleted', 'removed', 'replaced')),
  error text not null default '',
  created_at timestamptz not null default now(),
  purged_at timestamptz,
  primary key (bucket, object_path)
);

comment on table public.vehicle_photo_orphans is
  'Objetos de vehicle-photos cuyo borrado inmediato falló. El job de huérfanos de RgMotorsChileWeb los reintenta y setea purged_at.';

comment on column public.vehicle_photo_orphans.object_path is
  'Path dentro del bucket, o prefijo unidades-chile/<slug>/ si no se pudo listar la carpeta.';

comment on column public.vehicle_photo_orphans.reason is
  'sold: venta. deleted: auto borrado. removed: foto quitada. replaced: foto reemplazada.';

create index if not exists vehicle_photo_orphans_pending_idx
  on public.vehicle_photo_orphans (created_at)
  where purged_at is null;

alter table public.vehicle_photo_orphans enable row level security;

revoke all on table public.vehicle_photo_orphans from public, anon, authenticated;
grant select, insert, update, delete on table public.vehicle_photo_orphans to service_role;

-- ¿Sigue citada en el catálogo activo? Se llama después de guardar, para no borrar una foto en uso.
create or replace function public.vehicle_photo_is_referenced(object_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  escaped text;
  spin_i text;
  spin_index text;
begin
  if object_path is null or object_path = '' or object_path like '%..%' then
    return true;
  end if;
  escaped := replace(replace(replace(object_path, '\', '\\'), '%', '\%'), '_', '\_');
  -- Los fotogramas 360 se citan como .../{i}.jpg o .../{index}.jpg, no como 001.jpg.
  spin_i := regexp_replace(escaped, '/[0-9]{3}\.', '/{i}.');
  spin_index := regexp_replace(escaped, '/[0-9]{3}\.', '/{index}.');
  return exists (
    select 1
    from public.catalog_vehicles v
    where coalesce(v.image, '') like '%' || escaped || '%' escape '\'
       or coalesce(v.gallery::text, '') like '%' || escaped || '%' escape '\'
       or coalesce(v.spin::text, '') like '%' || escaped || '%' escape '\'
       or (spin_i <> escaped and coalesce(v.spin::text, '') like '%' || spin_i || '%' escape '\')
       or (spin_index <> escaped and coalesce(v.spin::text, '') like '%' || spin_index || '%' escape '\')
  );
end;
$$;

revoke all on function public.vehicle_photo_is_referenced(text) from public, anon, authenticated;
grant execute on function public.vehicle_photo_is_referenced(text) to service_role;

-- Solo objetos de vehicle-photos. No lista boletas, releases, notas ni evidencias.
create or replace function public.list_vehicle_photo_objects()
returns table(name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = 'vehicle-photos'
$$;

revoke all on function public.list_vehicle_photo_objects() from public, anon, authenticated;
grant execute on function public.list_vehicle_photo_objects() to service_role;
