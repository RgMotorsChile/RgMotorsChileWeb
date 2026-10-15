# Go-live — checklist operativa

Sitio en producción: `https://www.rgmotorschile.cl` (también apex `rgmotorschile.cl`).

## Ya OK en producción (verificado)

- KV + Blob + `ADMIN_SESSION_SECRET` + `CRON_SECRET`
- Dominios www + apex
- Auth admin, leads, headers de seguridad, CI
- Cron de Vercel **diario** (plan Hobby: no admite `*/30`). `vercel.json` dispara `/api/cron/sync` a las 11:00, 12:00 y 22:00 UTC. Sin `?tenant=`, las 12:00 UTC sincronizan Unidades Chile y el resto RG Motors
- GitHub Actions (`.github/workflows/sync-cron.yml`) sincroniza cada 30 minutos: minutos 5 y 35 UTC → `?tenant=rg-motors`; minutos 20 y 50 UTC → `?tenant=unidades-chile`. Los dos pegan a `https://www.rgmotorschile.cl` (el apex redirige 301 y pierde `Authorization`). El tenant se elige por query, no por host
- Cada corrida cabe en 60s (presupuesto de fotos que rota entre autos sin fotos; lo que no entra sigue en la siguiente) y deja una fila en `sync_state` (`catalog_cron`) con leídos / insertados / actualizados / omitidos / fotos / errores / duración, también si falla. HEIC, HEIF y DNG se guardan como el JPEG que ya renderiza Drive
- Sync omite preparación / incompletos; catálogo público exige precio y km > 0
- Sitemap solo vehículos públicos (sin vendidos/borrador)
- Mutaciones admin con `requireAdminSession` (defense-in-depth)

## Pendiente — vos (2–5 minutos en Vercel / Sheets)

Project → Settings → Environment Variables (**Production**):

| Variable | Para qué |
|----------|----------|
| `COMPANY_LEGAL_NAME` | Razón social (si no es “RG Motors Chile”) — opcional |
| `RESEND_API_KEY` | Avisos de leads por email |
| `EMAIL_FROM` | Remitente verificado en Resend |
| `NOTIFY_EMAIL` | Casilla donde llegan los leads |
| `NEXT_PUBLIC_SITE_URL` | Debe ser `https://www.rgmotorschile.cl` |
| `INVENTORY_SYNC_SECRET` | Opcional; si no, el webhook usa `CRON_SECRET` |
| `GOOGLE_DRIVE_CLIENT_ID` | OAuth Desktop/Web — Drive API (fotos) |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Secreto OAuth de Drive |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Refresh token de la cuenta U (o la que ve la carpeta). Generar con `node scripts/google-drive-oauth-setup.mjs` |
| `DRIVE_PHOTOS_FOLDER_ID` | Default `1etQDf-_InkLx8m4_AUMnc8xg2O_137St` (FOTOS RG/UNIDADES) |

> **RUT:** no se publica en el sitio (decisión de negocio).
> **Fotos Drive:** la carpeta está restringida; el sync usa OAuth → Vercel Blob (no scrape público).

Después de setear: **Redeploy**.

Verificar: `https://www.rgmotorschile.cl/api/health` → `ok: true` y `resend` en `true`.

### Admin

1. Entrar a `/admin/login`
2. Si pide cambio de clave → cambiar usuario/password ya
3. No dejar el default histórico

### Sync Excel altiro (Apps Script)

1. Abrí `scripts/google-apps-script-inventory-webhook.gs`
2. Pegá en Extensiones → Apps Script de la planilla
3. `WEBHOOK_SECRET` = mismo valor que `CRON_SECRET` (o `INVENTORY_SYNC_SECRET`)
4. Activador “Al modificar” → `onSheetChange`

### Fotos Drive (OAuth → Blob)

1. Habilitar Google Drive API + OAuth Desktop en Google Cloud
2. `node scripts/google-drive-oauth-setup.mjs` con la cuenta que ve la carpeta
3. Setear `GOOGLE_DRIVE_*` + `DRIVE_PHOTOS_FOLDER_ID` en Vercel → Redeploy
4. Disparar `/api/cron/sync?tenant=rg-motors` varias veces (tope de fotos nuevas por corrida; el resto sigue en la siguiente)

### Secret de GitHub Actions

El workflow de 30 minutos llama a producción con el mismo `CRON_SECRET` de Vercel. Hay que crearlo a mano (no está en el repo):

1. GitHub → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `CRON_SECRET`
3. Value: el mismo valor que `CRON_SECRET` en Vercel (Production)
4. Probar con **Actions → Sync inventario → Run workflow** y elegir el tenant

Sin ese secret el workflow falla antes de llamar al sitio. No hace falta cambiar `vercel.json`: en Hobby un cron `*/30` no se programa.

### Cuota Vercel (próximo sprint)

- Migrar restos de `public/cars` a Blob si quedan
- Dejar 1–2 deploys recientes

## Smoke rápido

```bash
curl -s https://www.rgmotorschile.cl/api/health
npm run test
```

Checklist seguridad ampliado: `docs/SEGURIDAD.md`.
