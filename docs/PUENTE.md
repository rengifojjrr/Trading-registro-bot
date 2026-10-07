# El puente con el bot (E4)

El bot de WhatsApp vive en una Mac que se duerme. La regla: **el bot siempre llama a la aplicación; la aplicación nunca
llama al bot.** No se abre ningún puerto de la Mac ni se depende de su túnel; cada lado guarda su cola y se pone al día
al volver. El otro lado vive en el repo del agente (`wa-core/src/puente/`).

## Rutas

Todas en `PUBLIC_PATH_PREFIXES` (`/api/puente`), y cada `route.ts` empieza por `abrirPeticion` (lo vigila
`middleware.test.ts`).

| Ruta | Para qué |
|---|---|
| `POST /api/puente/v1/ops` | Lote de hasta 50 operaciones; responde una por una: `applied`, `duplicate`, `conflict` o `rejected` |
| `GET /api/puente/v1/cambios?after=<seq>&limit=200` | Feed de cambios (cuenta como latido); `siguiente`, `mas`, `ultimo` |
| `GET /api/puente/v1/estado` | Hora del servidor, zona del dueño, versión, operaciones y otros clientes |
| `POST /api/puente/v1/proyecto/importar` | Archivo de proyecto, `modo: prueba \| aplicar` (el mismo lector y plan que «Importar desde Claude») |
| `GET /api/puente/v1/proyecto/:slug/markdown` | El proyecto como archivo, con ids, para Claude |
| `GET /api/puente/v1/proyectos` | La lista (nombre, slug, estado) |

## Firma

Cabeceras `X-Puente-Id` (`mac-1`, `vps-1`, `claude-1`), `X-Puente-Ts` (segundos), `X-Puente-Nonce` (16–64 caracteres
base64url) y `X-Puente-Firma` = base64url(HMAC-SHA256(llave, `v1\nMÉTODO\nruta?consulta\nts\nnonce\nsha256(cuerpo)`)).
Ventana de ±300 s, comparación en tiempo constante, nonce de un solo uso (`puente_usar_nonce`, 15 min), límite de 120
peticiones por minuto por cliente y cuerpos de 400 KB como mucho. `src/lib/puente/firma.ts` y su prueba llevan un
vector que el bot prueba igual.

## Llaves (sin variables nuevas en Vercel)

`puente_llaves` guarda la **sal** y la **huella** de cada llave; la llave se **deriva** en cada petición con
`HMAC(HMAC(SUPABASE_SERVICE_ROLE_KEY, "puente-pimienta-v1"), "puente-llave-v1|<id>|<sal>")`. Con una copia de la tabla no
se firma nada. Ajustes → «El puente con el bot» crea (dos vivas por cliente, para rotar sin cortar) y revoca una a una;
la llave (`pte1_…`) se ve una vez. En la Mac va en el `.env` del agente: `PUENTE_SECRET` (el bot, `mac-1`) y
`PUENTE_CLAUDE_SECRET` (Claude Code, `claude-1`). Si cambia la clave de servicio, las llaves dejan de valer (Ajustes y
Salud lo dicen) y se crean otras.

## Lista blanca

`src/lib/puente/tablas.ts`: las tablas que el puente toca, la única función que llama (`puente_usar_nonce`) y las
columnas que salen por el feed (sin notas, descripciones, cuerpos ni la nota del dueño). `tablas.test.ts` lee el código y
falla con un `.from()`/`.rpc()` de fuera, SQL libre, la sesión del navegador o un `console.*`.

## Operaciones

Lista cerrada en `esquemas.ts` (zod `.strict()`, topes de la base). Sobre: `{v:1, op_id, kind, at, origin, base_version?,
data}`. Reglas en `aplicar.ts` y `campos.ts`:

- `op_id` se aplica una vez (`puente_ops`); las claves externas `(user_id, ext_source, ext_id)` no duplican.
- `claude-1` sólo con `origin: claude`; el bot (`mac-1`, `vps-1`) con `owner` (lo dijo el dueño) o `bot` (lo dedujo).
- Lo deducido (`bot`) nunca pisa un campo del dueño (`field_src`), no crea proyectos, no enlaza WhatsApp, no escribe
  la ficha ni reabre; y no puede llevar un jid ni una tira de 7 cifras.
- `base_version` distinta de la de ahora → `conflict` con la foto actual: el bot pregunta antes de reenviar.
- Terminar es definitivo (`tarea_hecha` dos veces es una); reabrir sólo `owner`.
- `fuente_borrada` se lleva la fuente, las propuestas abiertas y la bitácora de esa referencia.
- Recordatorios: si `core_reminders` aún no existe (E2), `no_disponible` y el bot la guarda para más tarde.
  `recordatorio_hecho` y `recordatorio_posponer` hacen lo mismo que los botones del push (cierran o posponen el disparo,
  el recordatorio vuelve a sonar a esa hora y se apaga la campana) con `recordatorio_hecho_puente` /
  `recordatorio_posponer_puente`, sólo del rol de servicio; sin esas funciones, también `no_disponible`.
- `metricas_del_dia` (sólo números, módulo `whatsapp`) y `agente_estado` (latido, panel, WhatsApp, `bootId`; detecta
  dos procesos con la misma llave) no se apuntan en `puente_ops`.

## Base de datos

`20261006200000_el_puente_con_el_bot.sql` (aditiva): `puente_llaves`, `puente_nonces`, `puente_clientes`, `puente_ops`,
`puente_cambios` (RLS + sin permisos de tabla para `anon`/`authenticated`; el dueño sólo **lee** su latido),
`core_inbox` (propuestas, RLS del dueño), las funciones `puente_usar_nonce`, `puente_anotar_cambio` y
`puente_vigilar_tablas`, y la política restrictiva del segundo factor en cada tabla nueva.

`puente_vigilar_tablas()` pone el disparador del feed en cada tabla de la lista que exista y apunta lo que ya había (así
el bot recibe también lo de antes). `core_reminders` llega después (E2): lo vigila
`20261007130000_el_puente_y_los_recordatorios.sql`, que además trae las dos gemelas de arriba. Si se crea a mano en
otro orden, llamar otra vez `select public.puente_vigilar_tablas();`. Tras restaurar una copia (el feed no va en las copias),
`select public.puente_vigilar_tablas(true);`: el bot ve que su cursor va por delante y empieza de cero.

Pruebas: `supabase/tests/puente.prueba.sql` (dos cerraduras, disparadores, `por` sólo con el rol de servicio, nonces,
propuestas, resembrar, recordatorios), con `scripts/probar-migraciones-local.sh`.

## En la aplicación

- **Hoy**: la tarjeta WhatsApp (cifras y «● Bot en línea» / «Sin señal desde las 23:10»), sin nombres ni textos.
- **`/whatsapp`**: latido, dónde corre, versión, aviso de dos bots a la vez, cifras del día y «Abrir panel», «Abrir
  mapa», «Subir grabación» (`<panel>/?ir=mapa|reuniones`). El panel resuelve `?ir=` **después** de su puerta de acceso.
- **Ajustes → El puente con el bot**: crear, rotar y revocar llaves.

## Orden para subir a producción

1. Copia de la base en `data/backups/plataforma/` del agente.
2. Aplicar `20261006200000_el_puente_con_el_bot.sql` (una sola, con su fila en `supabase_migrations.schema_migrations`;
   **nunca** `supabase db push`).
3. Comprobar: `select public.puente_vigilar_tablas();` devuelve 0 (ya vigila) y `select count(*) from puente_cambios` es
   el número de filas de las tablas vigiladas.
4. Fusionar la rama. Crear las llaves en Ajustes y ponerlas en el `.env` de la Mac; reiniciar el bot.
