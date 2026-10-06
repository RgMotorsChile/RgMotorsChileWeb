-- Helpers RLS: anon no necesita EXECUTE (solo policies autenticadas / staff).
revoke execute on function public.current_inv_role() from anon, public;
grant execute on function public.current_inv_role() to authenticated, service_role;
revoke execute on function public.current_tenant_ids() from anon, public;
grant execute on function public.current_tenant_ids() to authenticated, service_role;
revoke execute on function public.is_inv_staff() from anon, public;
grant execute on function public.is_inv_staff() to authenticated, service_role;
revoke execute on function public.has_tenant_role(uuid, text[]) from anon, public;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated, service_role;
revoke execute on function public.inv_tenant_rg() from anon, public;
grant execute on function public.inv_tenant_rg() to authenticated, service_role;
