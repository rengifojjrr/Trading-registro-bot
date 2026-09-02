# Arquitectura

## Stack

| Área | Elección | Motivo |
|---|---|---|
| Framework | Next.js 16 (App Router), TypeScript, React 19 | Pedido explícito. Next 16 usa Turbopack por defecto y renombró `middleware.ts` a `proxy.ts` -- ver nota abajo. |
| Datos/Auth | Supabase (Postgres 17) + Supabase Auth | Pedido explícito. RLS en cada tabla (ver `docs/DATABASE.md`). |
| Estilos/UI | Tailwind CSS v4 + primitivas Radix hechas a mano al estilo shadcn/ui | Pedido explícito ("componentes modernos y accesibles"). El código de los componentes vive en el repo (`src/components/ui`), no es una dependencia opaca. |
| Tabla de operaciones | TanStack Table (añadido cuando se construya la Fase 4) | Headless, accesible, soporta orden/filtro/búsqueda sin reinventar lógica. |
| Gráficos | Recharts + un calendario de P&L propio (añadido en Fase 4) | Recharts para curva de capital/distribuciones; el calendario diario es un componente propio porque ninguna librería genérica lo resuelve bien. |
| Fechas/zonas horarias | Luxon | Único desvío tecnológico del stack pedido. La clasificación de sesión (Tokio/Londres/NY/Sídney) exige reglas DST reales por zona IANA -- ver `docs/DATABASE.md` y `src/lib/sessions/classify.ts`. |
| Validación | Zod v4 | Solo en límites del sistema: variables de entorno (`src/lib/env.ts`), formularios de configuración, futura importación CSV. |
| Aritmética financiera | decimal.js (dependencia añadida, uso real desde la Fase 3) | Los precios/tamaños/comisiones son `numeric` en Postgres y llegan como `string` por HTTP -- la aritmética de punto flotante nativa de JS no es aceptable para P&L. |
| Tests | Vitest + Testing Library | El motor de reconstrucción y el cálculo de P&L son el código de mayor riesgo del proyecto. Tests colocados junto al código fuente (`archivo.test.ts` junto a `archivo.ts`), no centralizados. |
| Firma JWT de Coinbase | `jose` + `node:crypto` | Ver `src/lib/coinbase/jwt.ts`. |
| Secretos | Solo variables de entorno del servidor | Nunca en Postgres. Ver `.env.example` y la página de Configuración. |

## Nota sobre Next.js 16

Este proyecto se generó con Next.js 16.3, que introdujo varios cambios que rompen compatibilidad respecto a versiones anteriores y que afectan directamente a este código:

- `middleware.ts` se renombró a `proxy.ts` (`src/proxy.ts` en este proyecto), con la función exportada como `proxy` en vez de `middleware`. El mecanismo es el mismo.
- `cookies()`, `headers()`, `params`, `searchParams` son siempre asíncronos (ya no hay compatibilidad síncrona).
- Los tipos `PageProps<'/ruta'>` / `LayoutProps<'/ruta'>` / `RouteContext` se generan automáticamente (`npx next typegen`, o al correr `next dev`/`next build`) y se usan en vez de tipar `params`/`searchParams` a mano.
- Turbopack es el bundler por defecto para `dev` y `build`.

Antes de escribir código de App Router nuevo, revisa `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` si algo no se comporta como se esperaría de una versión anterior de Next.js.

## Capa de adaptadores de Coinbase

```
src/lib/coinbase/
  types.ts              # tipos fieles a la respuesta real de Coinbase (ver docs/COINBASE_INTEGRATION.md)
  ports.ts               # MarketDataPort / PositionsPort -- la interfaz de la que depende el resto de la app
  jwt.ts                  # firma de JWT para CDP (real, testeado, sin llamadas HTTP)
  product-registry.ts    # lectura del multiplicador de contrato desde la tabla `products`
  venues/
    cfm.ts                # Coinbase Financial Markets (EE.UU.) -- venue primario recomendado. Stub hasta la Fase 2.
    intx.ts                # Internacional -- EXPERIMENTAL, Coinbase lo retira 2026-09-09. Stub hasta la Fase 2.
    mock.ts                 # Adaptador funcional con fills de ejemplo realistas -- usado por el seed demo y por tests futuros
```

Ni el motor de reconstrucción ni el dashboard hablan con `venues/cfm.ts` o `venues/intx.ts` directamente -- todo pasa por `MarketDataPort`. Esto es lo que permite que la migración de INTX al futuro gateway (o cualquier cambio de infraestructura de Coinbase) se resuelva reemplazando un archivo, no reconstruyendo la plataforma.

## Server Actions vs. Route Handlers

Las mutaciones iniciadas por el usuario (editar el diario, crear una etiqueta, guardar configuración, subir un CSV) usan **Server Actions** (`actions.ts` junto a cada `page.tsx`), no un árbol paralelo de endpoints REST bajo `app/api/`. `app/api/*` se reserva para lo que genuinamente necesita semántica HTTP: `cron/*` (disparado por un programador externo, protegido por `CRON_SECRET`), `export/*` (descargas de archivo con encabezados HTTP reales), y una futura ruta de salud.

## Estructura de carpetas (estado actual, Fase 1)

```
src/
  app/
    (auth)/{login,forgot-password,reset-password}/    # sin registro público -- ver README
    auth/{confirm,auth-code-error}/                     # intercambio de enlaces de email de Supabase Auth
    (dashboard)/
      layout.tsx        # shell protegido: sidebar + topbar + banner de datos demo
      page.tsx            # dashboard principal (estado vacío hasta la Fase 4)
      trades/[tradeId]/
      journal/ strategies/ reports/ import/ activity/ settings/
      bots/               # el submenú de bots: resumen, equipo, cantera, [botId], riesgo, impulsos, calendario -- ver docs/BOTS.md
  components/{ui,shared,layout,settings,bots}/
  lib/
    supabase/{client,server,admin}.ts
    auth/{require-user,actions}.ts
    coinbase/  (ver arriba)
    sessions/{config,classify}.ts + test
    bots/      # puro: métricas, puertas, semáforo, kill-switch, bloques, correlación, Monte Carlo, impulsos, decisiones, calendario; queries.ts es lo único con IO
    env.ts
    utils.ts
supabase/migrations/       # 12 archivos, ver docs/DATABASE.md
scripts/seed-demo-data.ts
docs/                        # este directorio
```

Carpetas que el plan del proyecto reserva para fases futuras y que todavía no existen: `lib/reconstruction/`, `lib/pnl/`, `lib/analytics/`, `lib/notion/`, `lib/csv/`, `lib/pdf/`, `app/api/cron/`, `app/api/export/`.

## Estado de las fases

- **Fase 1 (esta entrega)**: arquitectura, esquema completo, autenticación, shell del dashboard, interfaces de adaptador de Coinbase (sin llamadas reales), clasificador de sesión, datos demo. Ver el informe de cierre de fase para el detalle de qué se construyó y qué falta.
- **Fase 2**: importador real de Coinbase (adaptador CFM contra `venues/cfm.ts`), lógica de sincronización paginada con ventana de solapamiento.
- **Fase 3**: motor de reconstrucción + cálculo de P&L + suite de tests exhaustiva + herramienta de validación de 20-50 operaciones.
- **Fase 4**: dashboard y tabla de operaciones conectados a datos procesados reales.
- **Fase 5**: Notion, reportes mensuales, import/export CSV/PDF, notificaciones activas, página de configuración completa.
