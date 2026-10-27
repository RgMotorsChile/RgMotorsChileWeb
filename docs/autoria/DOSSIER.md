# Dossier de autoría

Constancia pública del software en el commit `e456148f970204824f8c10524b7cf1ef68601d3c` de `main`, con datos sacados del árbol y de `git log`. No es un certificado legal y no acredita por sí solo un contrato, una cesión de derechos ni una inscripción registral.

El autor indicado para esta constancia es **Mathias Jara** (GitHub [MathiasAlejandr0](https://github.com/MathiasAlejandr0), mathias.jara@hotmail.com), desarrollador full-stack, Chile. El detalle de identidades que Git sí grabó está en [`AUTHORS.md`](../../AUTHORS.md). La licencia está en [`LICENSE`](../../LICENSE).

Los hashes de abajo corresponden a ese commit de código, anterior a los archivos de esta carpeta.

## Proyecto

Repositorio: <https://github.com/RgMotorsChile/RgMotorsChileWeb>

En `package.json` de ese commit el paquete se llama `rg-motors`, versión `0.1.0`, y la descripción es «RG Motors - Plataforma de venta de vehículos usados con visor 360 propio». El título del [`README.md`](../../README.md) es «RG Motors — Plataforma de Autos Usados». No hay tags de Git en el repositorio.

`lib/company.ts` define el nombre comercial «RG Motors», el sitio `www.rgmotorschile.cl` y la dirección «Av. Cardonal (Ex Banco de Chile), Puerto Montt».

## Stack

Versiones resueltas en `package-lock.json` (`lockfileVersion` 3) en el commit fijado:

| Paquete | Versión en el lockfile |
| --- | --- |
| next | 16.2.12 |
| react / react-dom | 19.2.8 |
| typescript | 5.9.3 |
| tailwindcss | 3.4.19 |
| @supabase/supabase-js | 2.117.0 |
| three | 0.185.1 |
| vitest | 4.1.10 |
| @playwright/test | 1.62.1 |

También están declarados, entre otras dependencias, `@vercel/blob`, `googleapis` y `@react-pdf/renderer`. El repositorio incluye `vercel.json`.

En el código de ese commit hay cliente Supabase (`lib/supabase/client.ts`, `lib/server/catalogSupabase.ts`) y 27 migraciones SQL en `supabase/migrations/`. `docs/ESTADO-Y-ALCANCE.md` describe el catálogo en Supabase. `README.md` todavía dice «No usa Supabase»; esa frase no coincide con esos archivos.

Scripts de `package.json`: `dev`, `build`, `start`, `lint`, `test` (Vitest), `test:e2e` (Playwright).

## Módulos principales

Rutas con `page.tsx` en ese commit:

| Ruta de archivo | Qué es en el árbol |
| --- | --- |
| `app/(site)/page.tsx` | Inicio |
| `app/(site)/catalogo/page.tsx` | Catálogo |
| `app/(site)/vehiculo/[slug]/page.tsx` | Ficha |
| `app/(site)/comparador/page.tsx` | Comparador |
| `app/(site)/reserva/[slug]/page.tsx` | Reserva |
| `app/(site)/prueba-manejo/[slug]/page.tsx` | Prueba de manejo |
| `app/(site)/consigna/page.tsx` | Consigna |
| `app/(site)/contacto/page.tsx` | Contacto |
| `app/(site)/tour-360-demo/page.tsx` | Demo de tour 360 |
| `app/(site)/privacidad/page.tsx`, `terminos`, `aviso-credito`, `cookies`, `condiciones-reserva` | Páginas legales |
| `app/admin/page.tsx`, `app/admin/login/page.tsx` | Panel y login |
| `app/cuenta/page.tsx` | Cuenta |

`app/api/` tiene estos directorios: `admin`, `auth`, `car-requests`, `catalog`, `consigna`, `contact`, `cron`, `force-sync`, `health`, `photos`, `price-alerts`, `reservations`, `settings`, `sold-vehicles`, `spin`, `sync-drive`, `sync-sheet`, `test-drives`, `track`, `trade-in`, `vehicles`, `webhooks`.

Otros directorios de código:

- `components/` y `components/admin/`: interfaz.
- `lib/auth/`: sesión (`session.ts`), política de API (`apiAccess.ts`) y autenticación de máquina.
- `lib/server/`: stores, sincronización con Google Sheets y Drive, fotos, catálogo Supabase.
- `lib/vehicles/` y `lib/vehicles.ts`: modelo de vehículo, slug público, sucursal y publicación.
- `lib/supabase/`: cliente Supabase.
- `lib/seo/`, `lib/finance/`, `lib/chat/`, `lib/tenants/`, `lib/sales/`.
- `middleware.ts`: control de rutas de admin y de API, y cabeceras.
- `e2e/`: pruebas Playwright.
- `.github/workflows/`: `ci.yml`, `photo-gc.yml`, `photos-resync.yml`, `sync-cron.yml`.

## Fechas del historial

No hay versiones etiquetadas. La versión `0.1.0` es el campo `version` de `package.json` en el commit fijado, no un tag.

| Hito | Dato en Git o en el árbol |
| --- | --- |
| Primer commit | `9eed10dbef77f76d4cba0f160528e69adb38950b`, 2026-07-28T15:45:59-04:00, asunto «Initial commit» |
| Commit siguiente | `61f4581d91d00558453d1c05b621f16e0a32bc10`, 2026-07-28T16:09:32-04:00, asunto «Plataforma RG Motors: catalogo, credito, reserva y visor 360 propio (Mazda CX-5 con giro de 24 fotos)» |
| Prefijo de fecha en `supabase/migrations/*.sql` | del `20260922180000` al `20261022160000` (27 archivos) |
| Último commit de `main` | `e456148f970204824f8c10524b7cf1ef68601d3c`, 2026-10-22T15:30:26-03:00 |

Los conteos de commits y de líneas por autor están en [`AUTHORS.md`](../../AUTHORS.md).

## Archivo de código fuente fijado

Archivo: `lib/vehicles.ts` en el commit `e456148f970204824f8c10524b7cf1ef68601d3c`.

| Campo | Valor |
| --- | --- |
| Blob de Git | `ccc5635246c926a565711e8c7bb17e7a02d2c625` |
| Bytes | 52042 |
| SHA-256 del blob | `de8249fbbdb0832e52eddadc11c7be5d30792b508dede24d78528b3dfd911bf3` |

Comprobación:

```bash
git rev-parse e456148f970204824f8c10524b7cf1ef68601d3c:lib/vehicles.ts
git cat-file blob e456148f970204824f8c10524b7cf1ef68601d3c:lib/vehicles.ts | sha256sum
```

Ese SHA-256 es el del contenido del blob, no el identificador de objeto de Git (ese identificador es SHA-1).

## Sello OpenTimestamps

Se archivó el código de ese commit, sin esta documentación:

```bash
git archive --format=tar.gz e456148f970204824f8c10524b7cf1ef68601d3c
```

En el momento de generarlo, `HEAD` de `main` era ese commit. Git 2.43.0 produjo dos veces seguidas el mismo archivo.

| Campo | Valor |
| --- | --- |
| SHA-256 del tar.gz | `33c4cdf7be8cca2a10d4a148dd701ed31e13513a8388c03530e35cd24d598873` |
| Bytes | 264016944 |
| Prueba | [`rgmotors-main-e456148f.tar.gz.ots`](rgmotors-main-e456148f.tar.gz.ots) |
| Cliente | `ots` 0.7.2 (`opentimestamps-client`) |
| Registro local del hash | [`source-sha256.txt`](source-sha256.txt) |

El tar.gz no está en el repositorio.

`ots stamp --timeout 30` envió el hash a estos calendarios remotos:

- `https://a.pool.opentimestamps.org`
- `https://b.pool.opentimestamps.org`
- `https://a.pool.eternitywall.com`
- `https://ots.btc.catallaxy.com`

`ots info` muestra el mismo SHA-256 y cuatro atestaciones pendientes:

- `https://alice.btc.calendar.opentimestamps.org`
- `https://bob.btc.calendar.opentimestamps.org`
- `https://btc.calendar.catallaxy.com`
- `https://finney.calendar.eternitywall.com`

`ots verify` respondió, para los cuatro, **Pending confirmation in Bitcoin blockchain**. El sello todavía no queda anclado en un bloque de Bitcoin. Cuando los calendarios publiquen esa confirmación, se completa la prueba en el mismo archivo con:

```bash
ots upgrade docs/autoria/rgmotors-main-e456148f.tar.gz.ots
```

Para comprobar que una copia del tar.gz es la sellada, hay que ponerla junto a la prueba con el nombre `rgmotors-main-e456148f.tar.gz` y ejecutar `ots verify` sobre el `.ots`. Hasta el `ots upgrade`, esa verificación sigue en estado pendiente. `ots upgrade` no necesita el tar.gz; `ots verify` sí, porque compara el archivo con el hash comprometido.
