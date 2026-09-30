# Migraciones

Las versiones `20260923120000` … `20260930150109` ya están aplicadas en el proyecto Supabase compartido (RG Motors, Unidades Chile, inventario y boletas). Se copiaron al repo con el SQL registrado, sin reeditarlas, para que el historial coincida con lo que corrió en vivo.

No ejecutar `supabase db push` ni `migration up` contra esa base.

## Notas (sin cambiar el SQL)

- Varios archivos traen texto con mojibake (`estÃ¡`, `Â·`, `auditorÃ­a`, `catÃ¡logo`) y las de `20260930*` terminan en `;;`. Es el contenido aplicado. Corregir acentos o el punto y coma doble los desalinearía de la base.
- `20260926140000_harden_bodega_rpc_grants.sql` redefine `inv_tenant_rg()` con el UUID fijo `26291b1f-2133-4ea0-8b5e-83765c357771`. Un replay en una base nueva no coincide con el `insert` de `20260922180000_multitenant_hub.sql`, que genera el id.
- No reordenar: `20260923120000` concede `EXECUTE` de `correct_delivery_plate` a `anon` y `20260923150000` lo revoca. `20260926141000` quita `EXECUTE` anónimo de los helpers RLS y `20260926160000` lo devuelve: sin ese grant el `SELECT` público de `catalog_vehicles` queda vacío.
- `20260924190000` reemplaza `sync_vehicles_from_sheet(jsonb)` por `(jsonb, text)`.
- `20260930150109` rearma el `SELECT` de `vehicles` por columna e incluye `purchase_lot` para `authenticated`. Eso deja sin efecto el `revoke select (purchase_lot)` de `20260924190000`.
