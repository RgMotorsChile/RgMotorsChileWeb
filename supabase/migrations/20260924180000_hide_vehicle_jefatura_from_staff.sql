-- Bodega no debe leer observaciones ni ficha de jefatura por PostgREST.
-- El panel web sigue viendo todo con service_role.

revoke select (note, note_audio_path, supplier, location, source)
  on table public.vehicles
  from anon, authenticated, public;
