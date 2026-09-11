# Seguridad — RG Motors (sin pasarela de pago)

Alcance de esta versión: **sitio + leads + admin**. No hay WebPay/Transbank.

## Controles aplicados

| Control | Detalle |
|---------|---------|
| Auth admin | Cookie `httpOnly`, HMAC, comparación timing-safe, sesión 7 días |
| Secretos prod | `ADMIN_SESSION_SECRET` ≥ 32 chars obligatorio en Vercel Production |
| Middleware | Protege `/admin` y APIs; GET de leads con PII exige sesión |
| Origin check | POST públicos en prod requieren Origin/Referer del mismo host |
| Rate limit | Todos los POST de leads + login (8/min típico) |
| Honeypot | Campos trampa en todos los leads públicos |
| Validación | Email, teléfono Chile, RUT (si se envía) en servidor |
| Cron | `CRON_SECRET` obligatorio en prod (Bearer), compare timing-safe |
| Headers | nosniff, DENY frames, Referrer-Policy, HSTS, Permissions-Policy |
| Pagos | Explicitamente **fuera de alcance** — reservas siempre `Pendiente` |
| KV | Escrituras JSON rechazadas en prod sin KV |

## Variables mínimas (Vercel Production)

```
ADMIN_SESSION_SECRET=  # ≥32 caracteres aleatorios
CRON_SECRET=           # ≥16 caracteres
KV_REST_API_URL=
KV_REST_API_TOKEN=
BLOB_READ_WRITE_TOKEN= # recomendado para fotos
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=  # cuenta con acceso a FOTOS RG/UNIDADES (readonly)
DRIVE_PHOTOS_FOLDER_ID=      # opcional; default FOTOS RG/UNIDADES
NEXT_PUBLIC_SITE_URL=https://tu-dominio.cl
```

> Drive OAuth: solo scope `drive.readonly`. No subir el refresh token a git.
## Checklist go-live

1. [ ] Setear secretos en Vercel (no usar defaults del código).
2. [ ] Primer login admin → cambiar usuario y contraseña.
3. [ ] Verificar `GET /api/car-requests` sin cookie → **401**.
4. [ ] No publicar URL `/admin` en redes.
5. [ ] Links de IG/FB al dominio HTTPS canónico.
6. [ ] (Opcional) Cloudflare: WAF básico / rate limit al borde.

## Fuera de esta versión

- WebPay / tokens de tarjeta
- CSP estricto con nonces (siguiente iteración)
- Email transaccional (Resend) — aún stub `notifyTeam`
- Rate limit distribuido (Redis) — hoy in-memory por instancia

## Tests

```bash
npm run test          # incluye security + session
npm run test:e2e      # GET PII → 401, auth inválido
```
