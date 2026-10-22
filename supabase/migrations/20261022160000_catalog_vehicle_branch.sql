-- Sucursal física del auto. Cada sitio publica solo su patio.
alter table public.catalog_vehicles
  add column if not exists branch text;

comment on column public.catalog_vehicles.branch is
  'Sucursal física: rg-motors, unidades-chile o salgado.';

grant select (branch) on public.catalog_vehicles to anon;
