# Roadmap — RG Motors

Priorizado para práctica profesional (nota máxima) y para una eventual operación real.
**WebPay permanece bloqueado hasta contrato Transbank.**

---

## Leyenda

| Tag | Significado |
|-----|-------------|
| P0 | Bloqueante seguridad / datos |
| P1 | Importante para demo seria / ops |
| P2 | Mejora / feature comercial |
| P3 | Nice-to-have |

---

## Fase 0 — Hecho (baseline actual)

- [x] Catálogo, ficha, comparador (simulador de crédito retirado en oct 2026)
- [x] Solicitud de reserva **sin** pasarela de pago
- [x] Admin con auth middleware + must-change de credenciales
- [x] Persistencia JSON / Vercel KV (opcional)
- [x] Páginas legales y aviso de crédito
- [x] Documentación de alcance (`docs/ESTADO-Y-ALCANCE.md`)
- [x] Política de API testeable (`lib/auth/apiAccess.ts`) — GET de leads protegido
- [x] Suite de tests unitarios + e2e ampliada
- [x] Caché catálogo + `fields=card` + headers CDN
- [x] Vercel Blob ready (`BLOB_READ_WRITE_TOKEN`) + KV obligatorio en prod
- [x] 360 con preload progresivo + gate `showSpin360`
- [x] Hardening seguridad prod sin WebPay (`docs/SEGURIDAD.md`)

---

## Fase 1 — Hardening P0 (antes de datos reales de clientes)

Objetivo: poder desplegar en Vercel sin filtrar PII ni perder inventario.

| # | Ítem | Tag | Notas |
|---|------|-----|-------|
| 1.1 | Exigir `KV_REST_API_*` + `ADMIN_SESSION_SECRET` + `CRON_SECRET` en prod | P0 | Health `/api/health` + writes rechazan sin KV |
| 1.2 | Rate limit + honeypot en **todos** los POST de leads | P0 | + rate limit KV distribuido |
| 1.3 | Guardas anti-wipe en sync Sheets | P0 | `sheetSyncGuards.ts` |
| 1.4 | Fotos/360 a Blob (Vercel Blob / R2 / S3), no `public/` efímero | P0 | Prod rechaza upload sin Blob |
| 1.5 | Timing-safe compare en firma de sesión | P0 | |
| 1.6 | Quitar defaults de password del README público post-deploy | P0 | must-change + write verificado |
| 1.7 | Headers de seguridad (CSP básica, HSTS vía Vercel) | P1 | `vercel.json` + `securityHeaders` |

**Criterio de salida:** checklist de deploy firmado + tests e2e de “GET PII → 401”.

---

## Fase 2 — Operación comercial sin pagos online

| # | Ítem | Tag | Notas |
|---|------|-----|-------|
| 2.1 | Email real (`notifyTeam` → Resend/SMTP) | P1 | |
| 2.2 | `.env.example` + runbook de deploy en README | P1 | Parcialmente hecho |
| 2.3 | CI GitHub Actions: `lint` + `vitest` (+ e2e opcional) | P1 | |
| 2.4 | Defaults honestos en altas desde Sheets (sin inventar Diésel/Manual) | P1 | |
| 2.5 | Revisar naming UI “pre-aprobación” (SERNAC) | P1 | |
| 2.6 | Export/backup de leads e inventario desde admin | P1 | |
| 2.7 | Observabilidad (Sentry u similar) | P2 | |

**Criterio de salida:** leads llegan al correo de `COMPANY.email`; sync no destruye stock.

---

## Fase 3 — Pagos (bloqueado: sin contrato WebPay)

> **No implementar** hasta tener commerce code + API keys de Transbank y definición comercial del abono.

| # | Ítem | Tag | Dependencia |
|---|------|-----|-------------|
| 3.1 | Contrato Transbank WebPay Plus (o alternativa) | P2 | Negocio / jurídica |
| 3.2 | Integración API (ambiente `integration` → `production`) | P2 | 3.1 |
| 3.3 | Flujo: solicitud reserva → init transaction → commit → estado pagado | P2 | 3.2 |
| 3.4 | Webhooks / conciliación + UI admin de pagos | P2 | 3.2 |
| 3.5 | Actualizar legales (`/terminos`, aviso de abono reembolsable) | P2 | 3.1 |
| 3.6 | Tests e2e con sandbox Transbank | P2 | 3.2 |

Hasta entonces el copy oficial sigue siendo: *“solicitud de reserva; abono se coordina en tienda o WhatsApp”*.

---

## Fase 4 — Producto diferenciador

| # | Ítem | Tag |
|---|------|-----|
| 4.1 | Habilitar 360° por unidad con assets en CDN/Blob | P2 |
| 4.2 | Portal cliente `/cuenta` (reservas, favoritos) | P2 |
| 4.3 | Postgres (Supabase u otra) + migraciones en lugar de JSON monolítico | P3 |
| 4.4 | Service account Google Sheets (dejar de depender de link público) | P2 |
| 4.5 | App móvil / PWA | P3 |

---

## Orden sugerido para la defensa de práctica

1. Presentar `docs/ESTADO-Y-ALCANCE.md` (honestidad de alcance = madurez).
2. Demostrar catálogo + admin + tests (`npm run test:all`).
3. Mostrar este roadmap: P0 → P2, con **WebPay explícitamente diferido** por falta de contrato.
4. Si hay tiempo: cerrar Fase 1 (hardening) — es lo que más sube la nota técnica.

---

## Fuera de alcance actual

- Fingir pagos sin contrato.
- Garantía mecánica de usados como promesa de producto (ya filtrada en copy).
- Inventar KPIs de analytics demo.
