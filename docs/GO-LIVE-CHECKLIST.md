# Go-live — checklist operativa

Sitio en producción: `https://www.rgmotorschile.cl` (también apex `rgmotorschile.cl`).

## Ya OK en producción (verificado)

- KV + Blob + `ADMIN_SESSION_SECRET` + `CRON_SECRET`
- Dominios www + apex
- Auth admin, leads, headers de seguridad, CI
- Cron **2×/día** (08:00 y 19:00 Chile / UTC-3): GET `/api/cron/sync` ejecuta Sheets (solo hoja **RG MOTORS**, con precio+km) + fotos Drive
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
4. Disparar `/api/cron/sync` varias veces (tope ~10 vehículos/corrida)

### Cuota Vercel (próximo sprint)

- Migrar restos de `public/cars` a Blob si quedan
- Dejar 1–2 deploys recientes

## Smoke rápido

```bash
curl -s https://www.rgmotorschile.cl/api/health
npm run test
```

Checklist seguridad ampliado: `docs/SEGURIDAD.md`.
