-- "Limpiar fotos sin uso" (admin RG): devuelve TODAS las URLs de Vercel Blob
-- (del host indicado) que aparecen en cualquier columna de texto/json/array de
-- cualquier tabla de la base (public, boletas y demás esquemas de la app).
-- Solo lectura. Solo service_role puede ejecutarla.
create or replace function public.admin_blob_url_refs(blob_host text)
returns table(url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  pattern text;
begin
  if blob_host is null or blob_host !~ '^[a-z0-9]+\.public\.blob\.vercel-storage\.com$' then
    raise exception 'blob_host no válido';
  end if;
  pattern := 'https://' || replace(blob_host, '.', '\.') || '/[^"[:space:]\\,)<>'']+';
  for r in
    select c.table_schema as s, c.table_name as t, c.column_name as col
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     and tb.table_type = 'BASE TABLE'
    where c.table_schema not in (
      'pg_catalog','information_schema','pg_toast','auth','storage','realtime',
      'supabase_functions','extensions','graphql','graphql_public','vault',
      'pgsodium','pgsodium_masks','net','cron','supabase_migrations'
    )
      and c.data_type in ('text','character varying','character','json','jsonb','ARRAY','USER-DEFINED')
  loop
    return query execute format(
      'select distinct m[1] from %I.%I x, regexp_matches(x.%I::text, %L, ''g'') m',
      r.s, r.t, r.col, pattern
    );
  end loop;
end;
$$;

revoke all on function public.admin_blob_url_refs(text) from public, anon, authenticated;
grant execute on function public.admin_blob_url_refs(text) to service_role;
