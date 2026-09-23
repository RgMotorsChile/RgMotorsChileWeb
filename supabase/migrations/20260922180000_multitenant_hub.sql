-- Multi-tenant hub: RG Motors + Unidades Chile + Inventario bodega
-- Project: tuybpizjeszgwtcvunmp
-- Sheets: cada tenant tiene sheet_tab (RG MOTORS | UNIDADES CHILE)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sheet_id text,
  sheet_tab text not null,
  drive_folder_id text,
  site_url text,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in (
    'owner', 'admin_web', 'editor', 'bodega', 'jefatura', 'admin'
  )),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx on public.tenant_members (user_id);

-- ---------------------------------------------------------------------------
-- Catálogo web (RG Motors + Unidades Chile)
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slug text not null,
  plate text,
  plate_norm text generated always as (
    upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g'))
  ) stored,
  brand text not null,
  model text not null,
  version text not null default '',
  year integer not null,
  price numeric(14, 0) not null default 0,
  list_price numeric(14, 0),
  km integer not null default 0,
  fuel text not null default '',
  transmission text not null default '',
  body_type text not null default '',
  location text not null default '',
  image text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  spin jsonb,
  engine text not null default '',
  power text not null default '',
  traction text not null default '',
  doors integer not null default 4,
  owners integer not null default 1,
  featured boolean not null default false,
  status text not null default 'Disponible',
  has_real_photos boolean not null default false,
  cover_locked boolean not null default false,
  supplier text,
  tech_review text,
  circ_permit text,
  highlights jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create unique index if not exists catalog_vehicles_tenant_plate_uidx
  on public.catalog_vehicles (tenant_id, plate_norm)
  where plate_norm is not null and plate_norm <> '';

create index if not exists catalog_vehicles_tenant_status_idx
  on public.catalog_vehicles (tenant_id, status);

create table if not exists public.catalog_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null default 'contact',
  name text,
  phone text,
  email text,
  message text,
  status text not null default 'Nuevo',
  vehicle_slug text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_leads_tenant_created_idx
  on public.catalog_leads (tenant_id, created_at desc);

create table if not exists public.site_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_state (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  synced_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  primary key (tenant_id, key)
);

-- ---------------------------------------------------------------------------
-- Inventario bodega (InsForge → Supabase), scoped a tenant rg-motors
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete set null,
  full_name text not null default 'Encargado bodega',
  role text not null default 'bodega' check (role in ('bodega', 'jefatura', 'admin')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  email text,
  role text not null default 'bodega' check (role in ('bodega', 'jefatura')),
  created_by uuid references auth.users (id),
  used_at timestamptz,
  used_by uuid references auth.users (id),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.items (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sku text not null,
  name text not null,
  category text not null,
  brand text not null,
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  location text not null,
  unit_cost numeric(12, 0) not null default 0,
  compatible text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, sku)
);

-- Patentes de taller/bodega (no confundir con catalog_vehicles)
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plate text not null,
  plate_norm text generated always as (
    upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g'))
  ) stored,
  brand text not null,
  model text not null,
  year integer not null,
  color text not null,
  status text not null default 'Disponible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plate_norm)
);

create table if not exists public.boxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  barcode text not null,
  supplier text not null,
  guide text not null,
  received_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, barcode)
);

create table if not exists public.box_lines (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_sku text not null,
  qty integer not null check (qty > 0),
  foreign key (tenant_id, item_sku) references public.items (tenant_id, sku)
);

create table if not exists public.box_evidence (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  storage_path text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null,
  job_title text not null default 'Taller',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workers_tenant_name_uidx
  on public.workers (tenant_id, lower(full_name));

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null check (type in ('uso', 'ingreso', 'asignacion', 'devolucion', 'ajuste', 'dano')),
  item_sku text not null,
  qty integer not null check (qty > 0),
  vehicle_id uuid references public.vehicles (id),
  plate text,
  worker_id uuid references public.workers (id),
  worker_name text,
  box_id uuid references public.boxes (id),
  note text,
  outcome text check (outcome in ('instalado', 'usado', 'danado', 'extraviado')),
  user_id uuid references auth.users (id),
  user_name text not null default 'Bodega',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, item_sku) references public.items (tenant_id, sku)
);

create table if not exists public.receive_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  movement_id uuid references public.movements (id) on delete set null,
  item_sku text not null,
  qty integer not null default 1,
  storage_path text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, item_sku) references public.items (tenant_id, sku)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_sku text not null,
  qty integer not null check (qty > 0),
  worker_id uuid not null references public.workers (id),
  status text not null default 'abierta' check (status in ('abierta', 'devuelta')),
  note text,
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  returned_at timestamptz,
  foreign key (tenant_id, item_sku) references public.items (tenant_id, sku)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  actor_id uuid,
  actor_name text,
  action text not null,
  entity text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists movements_tenant_created_idx on public.movements (tenant_id, created_at desc);
create index if not exists movements_tenant_plate_idx on public.movements (tenant_id, plate);
create index if not exists assignments_tenant_open_idx on public.assignments (tenant_id, status, worker_id);

-- ---------------------------------------------------------------------------
-- Seed tenants (misma planilla, pestañas distintas)
-- ---------------------------------------------------------------------------
insert into public.tenants (slug, name, sheet_id, sheet_tab, site_url, settings)
values
  (
    'rg-motors',
    'RG Motors',
    '1BG2uR6APbXEMvVvRmdR-Nn0Vko6eobJ6Xam0XX41Ldc',
    'RG MOTORS',
    'https://www.rgmotorschile.cl',
    '{"modules":["catalog","inventory","leads"]}'::jsonb
  ),
  (
    'unidades-chile',
    'Unidades Chile',
    '1BG2uR6APbXEMvVvRmdR-Nn0Vko6eobJ6Xam0XX41Ldc',
    'UNIDADES CHILE',
    'https://unidadeschile.cl',
    '{"modules":["catalog","leads"]}'::jsonb
  )
on conflict (slug) do update set
  sheet_id = excluded.sheet_id,
  sheet_tab = excluded.sheet_tab,
  site_url = excluded.site_url,
  settings = excluded.settings,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Helpers RLS
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members
  where user_id = auth.uid() and active;
$$;

create or replace function public.has_tenant_role(p_tenant uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members
    where user_id = auth.uid()
      and tenant_id = p_tenant
      and active
      and role = any (roles)
  );
$$;

create or replace function public.current_inv_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), '');
$$;

create or replace function public.is_inv_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

-- Lectura pública del catálogo (anon) por tenant activo
alter table public.tenants enable row level security;
alter table public.catalog_vehicles enable row level security;
alter table public.catalog_leads enable row level security;
alter table public.site_settings enable row level security;
alter table public.tenant_members enable row level security;
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.vehicles enable row level security;
alter table public.movements enable row level security;
alter table public.boxes enable row level security;
alter table public.box_lines enable row level security;
alter table public.box_evidence enable row level security;
alter table public.workers enable row level security;
alter table public.assignments enable row level security;
alter table public.categories enable row level security;
alter table public.invites enable row level security;
alter table public.receive_photos enable row level security;
alter table public.audit_log enable row level security;
alter table public.sync_state enable row level security;

-- Tenants: lectura pública de activos (para apps)
drop policy if exists tenants_public_read on public.tenants;
create policy tenants_public_read on public.tenants
  for select using (active = true);

drop policy if exists catalog_vehicles_public_read on public.catalog_vehicles;
create policy catalog_vehicles_public_read on public.catalog_vehicles
  for select using (
    status in ('Disponible', 'En reserva', 'publicado')
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.active)
  );

drop policy if exists catalog_vehicles_member_write on public.catalog_vehicles;
create policy catalog_vehicles_member_write on public.catalog_vehicles
  for all using (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin','jefatura'])
  )
  with check (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin','jefatura'])
  );

drop policy if exists catalog_leads_insert_public on public.catalog_leads;
create policy catalog_leads_insert_public on public.catalog_leads
  for insert with check (
    exists (select 1 from public.tenants t where t.id = tenant_id and t.active)
  );

drop policy if exists catalog_leads_member_read on public.catalog_leads;
create policy catalog_leads_member_read on public.catalog_leads
  for select using (
    public.has_tenant_role(tenant_id, array['owner','admin_web','editor','admin','jefatura'])
  );

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select using (true);

-- Inventario: solo staff activo del tenant
drop policy if exists inv_items_staff on public.items;
create policy inv_items_staff on public.items
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_vehicles_staff on public.vehicles;
create policy inv_vehicles_staff on public.vehicles
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists inv_movements_staff on public.movements;
create policy inv_movements_staff on public.movements
  for all using (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()))
  with check (public.is_inv_staff() and tenant_id in (select public.current_tenant_ids()));

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select using (id = auth.uid() or public.current_inv_role() in ('jefatura','admin'));

-- Service role bypasses RLS (migraciones / sync server-side).
