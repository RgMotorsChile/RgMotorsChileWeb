# Supabase multi-tenant (RG Motors + Unidades Chile + Inventario)

Project: `tuybpizjeszgwtcvunmp`  
URL: https://tuybpizjeszgwtcvunmp.supabase.co

## Tenants y Sheets

| Tenant slug | App | Pestaña Google Sheet |
|-------------|-----|---------------------|
| `rg-motors` | Sitio RG Motors + Inventario bodega | **RG MOTORS** |
| `unidades-chile` | Sitio Unidades Chile | **UNIDADES CHILE** |

## Estado (verificado)

| App | Supabase | Auth |
|-----|----------|------|
| RG Motors | Catálogo 41 (sin KV) | Público |
| Unidades Chile | Catálogo 18 | Admin local |
| Inventario web | 66 items / 63 patentes | Supabase (falta create-admin si profiles=0) |
| Inventario Flutter | API bodega + Storage | Supabase |

## Auth inventario

```bash
cd "SistemaInventario RgMotors/web"
INV_ADMIN_EMAIL=... INV_ADMIN_PASSWORD='...' INV_ADMIN_NAME='...' npm run create-admin
```

## Flutter

```bash
flutter run \
  --dart-define=SUPABASE_ANON_KEY=eyJ... \
  --dart-define=JEFATURA_WEB_URL=https://tu-panel-inventario
```

## Setup schema

```bash
cd rgmotors
supabase link --project-ref tuybpizjeszgwtcvunmp
supabase db push
```

## Migrar catálogo

```bash
node scripts/migrate-catalog-to-supabase.mjs
```
