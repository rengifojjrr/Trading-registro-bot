# Espejo saliente hacia Notion (Fase 5)

A diferencia de `scripts/import-notion-journal.ts` (backfill puntual, Notion -> app, ver `docs/NOTION_IMPORT.md`), esto es el camino contrario y continuo: **app -> Notion**, automático, en un solo sentido. Notion nunca es la fuente de verdad de un trade sincronizado desde Coinbase; es un espejo de lectura para quien prefiera seguir viendo su diario en Notion.

## Cuándo se dispara

Tres puntos de la app llaman a `enqueueNotionSync(userId, tradeId)` (`src/lib/notion/sync.ts`) después de que un trade cambia:

| Origen | Archivo |
|---|---|
| Sincronización con Coinbase (cada ~5 min) | `src/lib/sync/orchestrator.ts`, tras `persistReconstruction()` |
| Conciliación nocturna | `src/lib/sync/reconciliation.ts`, tras `persistReconstruction()` |
| Guardar el diario (Estrategia, Emociones, Setup, notas...) | `src/app/(dashboard)/trades/[tradeId]/actions.ts`, tras guardar `journal_entries` |

`enqueueNotionSync` nunca lanza una excepción -- si Notion no está configurado, si `app_settings.notion_enabled` está apagado, o si la propia base de datos falla al escribir la cola, simplemente no hace nada. La sincronización de Coinbase (el dato objetivo, crítico) nunca depende de que Notion esté sano.

## Por qué una cola en vez de una llamada directa

Escribir directamente a la API de Notion dentro de `persistReconstruction`/`saveJournalEntry` acoplaría la latencia y disponibilidad de Notion a operaciones que no deberían depender de un tercero. En su lugar:

1. `enqueueNotionSync` solo inserta (o reactiva) una fila en `notion_sync_queue`.
2. `/api/cron/notion-sync`, con la misma cadencia externa de ~5 min que `/api/cron/sync` (ver README -- ambas rutas las dispara el mismo workflow de GitHub Actions, no `vercel.json`, porque el plan gratuito de Vercel limita los crons nativos a una vez al día), llama a `processNotionSyncQueue()`, que drena lo pendiente.

Un trade que cambia dos veces antes de que corra el próximo ciclo no genera dos filas -- `enqueueNotionSync` reutiliza la fila `PENDING`/`PROCESSING` existente para ese `trade_id` en vez de duplicarla.

## Nunca duplicar una página de Notion

Esta es la regla central del diseño (`resolveTargetPage` en `src/lib/notion/sync.ts`). Para cada trade, antes de decidir crear o actualizar:

1. **¿Existe `notion_sync_links` para este `trade_id`?** Si sí, se actualiza esa página (`notion.pages.update`).
2. Si no, **¿el trade vino originalmente de la importación histórica de Notion** (existe `notion_import_links` para este `trade_id`)? Si sí, se actualiza esa misma página original -- nunca se crea una segunda. Además se crea la fila `notion_sync_links` correspondiente en ese momento, para que la próxima vez el paso 1 ya la encuentre.
3. Solo si ninguna de las dos existe, se crea una página nueva (`notion.pages.create`).

Esto significa que una operación que llegó por el import de Notion y luego se edita en la app (por ejemplo, agregando Emociones) actualiza la página original en Notion en vez de crear un duplicado.

## Qué se escribe en cada página

`src/lib/notion/mapper.ts` (`buildNotionProperties`) arma las mismas propiedades que la importación histórica sabe leer (título, Fecha, Ticker, Dirección, Entrada/Salida/Tamaño/Comisiones/PnL, Cuenta, Mercado, Resultado, y si hay diario: R múltiplo, Stop Loss, Take Profit, Emociones, Errores, `trend `, Notas) -- así un trade se ve igual en Notion sin importar si nació ahí o en Coinbase. Los campos objetivos (precio, tamaño, comisiones, PnL) siempre reflejan lo que calculó el motor de reconstrucción, nunca un valor editado a mano en Notion.

Cualquier `internal_field` marcado `enabled=false` en `notion_field_mappings` (tabla editable por el usuario, sin UI todavía -- ver "Pendiente" abajo) se omite de la escritura.

## Evitar llamadas innecesarias a la API de Notion

Antes de llamar a `pages.update`, se compara un hash SHA-256 de las propiedades a enviar contra `notion_sync_links.last_synced_hash`. Si no cambió nada desde el último envío exitoso, la fila de la cola se marca `SUCCEEDED` sin llamar a Notion. Esto importa porque Notion limita a ~3 req/s por integración con un límite secundario de 1000 req/5min por workspace (ver `docs/ARCHITECTURE.md`).

## Reintentos y fallos

`notion_sync_queue.attempt_count` crece con cada intento fallido; el siguiente intento se agenda con backoff exponencial (60s, 120s, 240s... hasta un máximo de 1 hora). Después de 5 intentos fallidos, la fila pasa a `FAILED_PERMANENT` y se crea una notificación (`type='NOTION_ERROR'`, visible en Actividad) con el último error -- nunca reintenta indefinidamente en silencio. Cada intento, exitoso o no, queda registrado en `notion_sync_history` (incluye si fue un `RATE_LIMITED` explícito de Notion).

## Pendiente

- UI en Configuración para editar `notion_field_mappings` fila por fila (hoy es "sincronizar todo" salvo que se edite la tabla directamente en Supabase).
- Reintento manual desde la página de Actividad para una fila `FAILED_PERMANENT` (hoy requiere esperar una nueva escritura del trade, que la vuelve a encolar).
