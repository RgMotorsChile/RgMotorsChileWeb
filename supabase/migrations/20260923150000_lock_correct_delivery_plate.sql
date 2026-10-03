-- El panel llama con service role. Anon no debe poder corregir patentes por PostgREST.

revoke execute on function public.correct_delivery_plate(uuid, text, text, uuid, text) from anon, authenticated, public;
grant execute on function public.correct_delivery_plate(uuid, text, text, uuid, text) to service_role;
