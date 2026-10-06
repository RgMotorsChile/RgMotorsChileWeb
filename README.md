<div align="center">

<img src="public/logo.png" alt="RG Motors" width="220" />

# RG Motors — Plataforma de Autos Usados

**Plataforma web de automotora para Chile (Puerto Montt).**  
Catálogo, solicitud de reserva **sin pago online**,
comparador y panel admin.

<br/>

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## Documentación de alcance (leer primero)

| Documento | Contenido |
|-----------|-----------|
| [`docs/ESTADO-Y-ALCANCE.md`](docs/ESTADO-Y-ALCANCE.md) | Qué está hecho, qué no, y posición oficial sobre **WebPay** |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Roadmap priorizado (hardening → ops → pagos con contrato) |
| [`docs/OPS-RENDIMIENTO.md`](docs/OPS-RENDIMIENTO.md) | Volumen (100 autos), Blob, KV, Cloudflare, 360 fluido |
| [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) | Hardening producción **sin** pasarela de pago |
| [`.env.example`](.env.example) | Variables de entorno |

> **No hay contrato Transbank/WebPay.** La reserva web es una **solicitud** (`Pendiente`); el abono se coordina en tienda o WhatsApp. No se vende cobro online como feature lista.

---

## Estado real del stack

- **App**: Next.js (App Router) + React + TypeScript + Tailwind.
- **Persistencia**: JSON locales y/o **Vercel KV** (`lib/server/db.ts`). **No** usa Supabase.
- **Pagos**: sin pasarelas. Ver roadmap fase 3 (bloqueada por contrato).
- **360°**: componentes en código; **no** forman parte del release comercial actual.
- **Admin**: middleware + cookie firmada (`/admin/login`). En el primer ingreso obliga a cambiar usuario y contraseña. Secretos: ver `.env.example`.
- **Leads**: se persisten; notificación al equipo hoy es stub (`lib/server/notify.ts`) hasta conectar email.
- **Legales**: `/privacidad`, `/terminos`, `/aviso-credito`.
- **Seguridad API**: política en `lib/auth/apiAccess.ts` — POST de leads público; **GET de listados con PII exige admin**.

---

## Cómo ejecutarlo

```bash
npm install
cp .env.example .env.local   # completar secretos en prod
npm run dev                  # http://localhost:3000
npm run build && npm start
```

### Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo |
| `npm run build` / `start` | Producción |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (unitarios) |
| `npm run test:e2e` | Playwright |
| `npm run test:all` | lint + unit + e2e |

---

## Tests

Cobertura orientada a **nota de práctica / hardening**:

- Unit: RUT, sesión admin, política de API (PII), rate limit, credenciales fuertes, company, vehiclesStore.
- E2E: home, catálogo, redirect de /simulador retirado, legales, redirect admin, GET PII → 401, catálogo API público.

CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre lint + vitest + playwright en `main`.

---

## Características principales

| Función | Descripción |
|---------|-------------|
| Solicitud de reserva | Sin pago online |
| Prueba de manejo | Agenda por sucursal |
| Catálogo / comparador | Filtros y ficha |
| Admin | Inventario + CRM + sync Sheets/Drive |

---

## Stack

- Frontend: Next.js · React · TypeScript · Tailwind  
- Persistencia: JSON + Vercel KV (recomendado en prod)  
- Hosting: Vercel  

---

## Estructura

```
app/(site)/     # Público (+ legales)
app/admin/      # Panel
app/api/        # REST (leads, auth, vehicles, cron…)
lib/auth/       # Sesión + política de API
lib/server/     # Stores + db + notify
docs/           # Alcance y roadmap
e2e/            # Playwright
```

---

## Roadmap (resumen)

1. **Fase 1** — Hardening P0 (KV obligatorio, sync seguro, Blob fotos, email).  
2. **Fase 2** — Operación sin cobro online.  
3. **Fase 3** — WebPay **solo con contrato Transbank**.  
4. **Fase 4** — 360° comercial, portal cliente, DB SQL opcional.

Detalle: [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Autor

Proyecto para **RG Motors** por [**MathiasAlejandr0**](https://github.com/MathiasAlejandr0).

<div align="center">
<sub>Hecho en Chile — alcance documentado con honestidad técnica.</sub>
</div>
