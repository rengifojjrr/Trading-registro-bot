# Trading Registro Bot

Plataforma privada de registro, reconstrucción y análisis de operaciones de futuros de Bitcoin en Coinbase Advanced. Reemplaza una plantilla manual de Notion como diario principal de trading; Notion queda como espejo secundario opcional.

**Estado actual: Fase 1 de 5** -- arquitectura, esquema de base de datos completo, autenticación y datos de demostración. Todavía **no** hay conexión con Coinbase real ni sincronización automática. Ver `docs/ARCHITECTURE.md` para el detalle de qué incluye cada fase.

La aplicación nunca solicita permisos de trading, retiro o transferencia -- solo lectura (`view`) sobre tu cuenta de Coinbase.

## Requisitos

- Node.js 20.9+ (usa 22 si puedes; es lo que se usó para construir este proyecto).
- Una cuenta de Supabase (capa gratuita es suficiente para empezar).
- Una cuenta de Coinbase Advanced (la clave de API se configura más adelante, en la Fase 2 del proyecto -- no es necesaria todavía).

## 1. Instalar dependencias

```bash
npm install
```

## 2. Configurar Supabase

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com) dedicado a esta aplicación (recomendado: no reutilices un proyecto de otra app, para mantener el aislamiento de datos financieros).
2. En **Project Settings -> API**, copia:
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (antes llamada "anon key") -> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Service role key** (secreta) -> `SUPABASE_SERVICE_ROLE_KEY`
3. Copia `.env.example` a `.env.local` y completa esos tres valores.
4. **Desactiva el registro público** en el proyecto: Authentication -> Settings -> desactiva "Allow new users to sign up". Esta aplicación es privada por diseño -- no tiene página de registro, y así se evita que alguien cree una cuenta de otra forma.
5. Aplica las migraciones. Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):

   ```bash
   npx supabase login
   npx supabase link --project-ref <tu-project-ref>
   npx supabase db push
   ```

   Esto ejecuta, en orden, los 12 archivos de `supabase/migrations/`. Cada uno fue verificado manualmente contra una instancia local de Postgres antes de esta entrega (RLS, triggers, invariantes de reversal -- ver `docs/DATABASE.md`), pero **revísalos tú también** antes de aplicarlos a un proyecto real; son el esquema completo de tu diario financiero.

6. Crea tu único usuario. Como no hay registro público, créalo desde el dashboard de Supabase (**Authentication -> Users -> Add user**) o con la CLI/API admin. El trigger `handle_new_user` crea automáticamente tus filas de `profiles` y `app_settings`.

7. (Opcional) Genera los tipos de TypeScript reales desde tu proyecto, reemplazando el archivo escrito a mano:

   ```bash
   npx supabase gen types typescript --project-id <tu-project-ref> > src/types/database.ts
   ```

   Si haces esto, vuelve a aplicar a mano el tipo `SessionLabel` y los comentarios que tenía el archivo -- `supabase gen types` no los conserva. Ver `docs/DATABASE.md`.

## 3. Sembrar datos de demostración (opcional pero recomendado)

Con `.env.local` completo y las migraciones aplicadas:

```bash
npm run seed:demo -- tu-correo@ejemplo.com
```

Crea una cuenta marcada `is_demo = true` con cinco operaciones de ejemplo (long simple, short simple, entradas/salidas parciales, y un reversal long→short) generadas a partir de fills ficticios con forma idéntica a la respuesta real de Coinbase (`src/lib/coinbase/venues/mock.ts`). El dashboard muestra un aviso visible mientras esta cuenta esté activa -- nunca se presenta como dato real.

## 4. Ejecutar la aplicación

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Sin sesión, cualquier ruta te redirige a `/login`.

## 5. Pruebas

```bash
npm test           # una vez
npm run test:watch # modo watch
npm run typecheck
npm run lint
npm run build       # build de producción; también corre la verificación de tipos completa
```

La suite actual cubre la firma de JWT de Coinbase (`src/lib/coinbase/jwt.test.ts`), el adaptador simulado (`src/lib/coinbase/venues/mock.test.ts`) y el clasificador de sesión con casos de cambio de horario de verano, incluyendo el caso de Sídney (hemisferio sur, DST invertido) (`src/lib/sessions/classify.test.ts`).

### Pruebas end-to-end

```bash
npm run test:e2e     # navegador real, escritorio y móvil
npm run test:e2e:ui  # modo interactivo
```

Estas pruebas manejan la aplicación real contra un proyecto Supabase real: casi todas las páginas pasan por el middleware de autenticación y por RLS, así que correrlas contra un proyecto falso solo demostraría que una base de datos rota devuelve una página de error. **Sin credenciales no fallan: se reportan como omitidas**, de modo que `npm test` sigue en verde para quien no tenga acceso al proyecto.

Hay dos formas de darles una cuenta:

| Variables | Qué hace la suite |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Crea un usuario desechable al arrancar y **lo borra al terminar**, incluso si las pruebas fallan. Es lo que usa CI. |
| `E2E_USER_EMAIL` + `E2E_USER_PASSWORD` | Inicia sesión con una cuenta que tú creaste. Nunca crea ni borra nada. Úsalo si no quieres darle acceso de servicio a un runner de pruebas. |

La limpieza consiste en borrar el usuario de `auth.users`: todas las tablas de la aplicación lo referencian con `on delete cascade`, así que sus operaciones, fills e importaciones se van con él.

Con la segunda opción, las dos pruebas que **importan** un CSV se omiten con un mensaje explícito, porque escribir requiere la clave de servicio en el servidor.

Variables opcionales: `E2E_BASE_URL` para correr contra un servidor ya levantado (si no, la suite hace `build` + `start`), y `PLAYWRIGHT_CHROMIUM_PATH` para entornos que ya traen su propio Chromium.

En CI el job `e2e` comprueba si existen los secretos `E2E_SUPABASE_*` y se salta sus pasos si no están; el job `verify` (tipos, lint, unitarias, build) siempre tiene que pasar.

## Registrar la integración con Coinbase (Fase 2 -- todavía no requerido)

Cuando llegue esa fase:

1. Ve a [Coinbase Developer Platform](https://portal.cdp.coinbase.com/) -> Access -> API keys.
2. Crea una clave nueva con **únicamente el permiso `view`**. Nunca actives `trade` ni `transfer` para esta aplicación.
3. CDP te muestra el nombre de la clave y la clave privada **una sola vez**. Guárdalos de inmediato en tu gestor de secretos.
4. Configura `COINBASE_CDP_API_KEY_NAME` y `COINBASE_CDP_PRIVATE_KEY` como variables de entorno del servidor (`.env.local` en desarrollo; secretos de tu proveedor de hosting en producción). Nunca las pegues en el chat de un asistente si existe una forma de configurarlas localmente.
5. Confirma el `product_id` exacto que operas (ver `docs/COINBASE_INTEGRATION.md`) y configura `COINBASE_PRODUCT_ID` / `COINBASE_PRODUCT_VENUE`.
6. **No actives la sincronización automática todavía.** Sigue el procedimiento completo de `docs/VALIDATION_CHECKLIST.md` primero.

### Rotar o revocar la clave de Coinbase

1. Crea una clave nueva en CDP (con el mismo permiso `view` únicamente).
2. Actualiza `COINBASE_CDP_API_KEY_NAME` / `COINBASE_CDP_PRIVATE_KEY` en tu proveedor de hosting y redepliega (o reinicia el proceso en desarrollo).
3. Verifica que la sincronización siga funcionando (página de Actividad).
4. Revoca la clave antigua desde el portal de CDP.

Para revocar sin reemplazar (por ejemplo, si sospechas que la clave se filtró): revócala inmediatamente en CDP -- la clave es de solo lectura, así que una revocación tardía no expone fondos, pero sí historial de operaciones.

## Configurar Notion (opcional, Fase 5)

1. Crea una integración interna en [notion.so/my-integrations](https://www.notion.so/my-integrations) y copia el token.
2. Comparte la base de datos de Notion destino con esa integración.
3. Configura `NOTION_API_TOKEN` y `NOTION_DATABASE_ID` como variables de entorno del servidor.
4. Activa el interruptor "Activar espejo en Notion" en Configuración dentro de la app.

A partir de ahí, cada operación (sincronizada desde Coinbase o editada en el diario) se refleja automáticamente en esa base de datos de Notion -- ver `docs/NOTION_OUTBOUND_SYNC.md` para el diseño completo (cola con reintentos, cómo evita duplicar páginas para operaciones que ya vinieron de un import de Notion, qué campos se escriben). Requiere que el workflow de GitHub Actions de la sección "Programar la sincronización" esté configurado, igual que la sincronización de Coinbase.

Un fallo de Notion nunca bloquea la sincronización de Coinbase -- son procesos desacoplados por diseño (ver `docs/ARCHITECTURE.md`).

## Importar histórico

- **Vía API**: Fase 2/3, una vez conectada la clave de Coinbase.
- **Vía CSV** (respaldo): Fase 5.

## Desplegar

Pensado para desplegarse en Vercel (Next.js 16 + Turbopack), pero no depende de Vercel específicamente salvo por el mecanismo de cron sugerido por defecto (`app/api/cron/*`, con `pg_cron` de Supabase documentado como alternativa -- ver `docs/ARCHITECTURE.md`).

Variables de entorno a configurar en el proveedor de hosting: todas las de `.env.example` salvo los comentarios. Nunca subas `.env.local` al repositorio -- está en `.gitignore`.

## Programar la sincronización (cron)

Hay tres rutas protegidas por `CRON_SECRET` (`Authorization: Bearer <CRON_SECRET>`, ver `src/lib/sync/verify-cron-request.ts`):

| Ruta | Qué hace | Cadencia deseada |
|---|---|---|
| `/api/cron/sync` | Poll de fills nuevos en Coinbase + reconstrucción de trades | ~5 min |
| `/api/cron/notion-sync` | Drena la cola del espejo de Notion (`docs/NOTION_OUTBOUND_SYNC.md`) | ~5 min |
| `/api/cron/reconcile` | Conciliación nocturna contra Coinbase | 1 vez al día |

**El plan gratuito de Vercel limita los Cron Jobs nativos a 2 como máximo, cada uno ejecutable solo una vez al día** -- insuficiente para las dos rutas de ~5 min. Por eso este repo separa el mecanismo:

- `vercel.json` declara únicamente `/api/cron/reconcile` (una vez al día, encaja en el límite del plan gratuito). Si tu plan de Vercel sí permite crons más frecuentes, puedes mover las otras dos rutas ahí también y retirar el workflow de abajo.
- `.github/workflows/coinbase-sync-cron.yml` llama a `/api/cron/sync` y `/api/cron/notion-sync` cada 5 minutos vía `curl`, usando GitHub Actions como programador externo gratuito.

Para activar el workflow, en el repositorio de GitHub ve a **Settings -> Secrets and variables -> Actions** y crea:

- `CRON_SECRET`: el mismo valor que configuraste como variable de entorno en Vercel.
- `APP_URL`: la URL pública de tu despliegue, sin `/` final (p. ej. `https://tu-app.vercel.app`).

GitHub Actions no garantiza el minuto exacto de un cron programado (puede atrasarse unos minutos bajo carga) -- suficiente para este caso de uso, pero no lo trates como un temporizador preciso. También puedes disparar el workflow manualmente desde la pestaña Actions (`workflow_dispatch`) para probarlo sin esperar al próximo ciclo.

## Estructura del proyecto

Ver `docs/ARCHITECTURE.md`.

## Seguridad

- Las credenciales de Coinbase y Notion viven únicamente en variables de entorno del servidor -- nunca en la base de datos, nunca en el frontend, nunca en el repositorio.
- Cada tabla tiene políticas de Row Level Security; un usuario solo puede leer sus propias filas (ver `docs/DATABASE.md`).
- `raw_fills` es inmutable a nivel de base de datos (sin política de `UPDATE`/`DELETE`) -- ni siquiera el proceso de sincronización puede editar un fill ya guardado.
- La aplicación nunca solicita permisos de trading o transferencia sobre tu cuenta de Coinbase.

Si encuentras una vulnerabilidad, no abras un issue público -- repórtala de forma privada.
