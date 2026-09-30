-- Versiones de la app de bodega. Jefatura publica; el celular descarga e instala.

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  version_code integer not null,
  version_name text not null,
  storage_path text not null,
  notes text,
  force_update boolean not null default true,
  published_by uuid,
  published_by_name text,
  created_at timestamptz not null default now(),
  unique (tenant_id, version_code)
);
create index if not exists app_releases_tenant_code_idx
  on public.app_releases (tenant_id, version_code desc);
alter table public.app_releases enable row level security;
drop policy if exists app_releases_staff_select on public.app_releases;
create policy app_releases_staff_select on public.app_releases
  for select
  using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-releases',
  'app-releases',
  false,
  157286400,
  array[
    'application/vnd.android.package-archive',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
