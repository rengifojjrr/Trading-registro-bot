# Importación histórica desde Notion

Herramienta de respaldo (`scripts/import-notion-journal.ts`, `npm run import:notion -- <email>`) que trae el historial de un diario de trading manual en Notion a esta plataforma. Es un **backfill puntual**, no una vía de sincronización en vivo: se corre cuando el usuario lo pide (por ejemplo, tras agregar operaciones nuevas al Notion), nunca automáticamente.

Todo lo que crea queda marcado sin ambigüedad como de origen manual:

- `trades.source = 'NOTION_IMPORT'` (nunca `COINBASE_SYNC`)
- `accounts.venue = 'EXTERNAL'` / `products.venue = 'EXTERNAL'`
- `products.product_id` termina en `-EXTERNAL` (p. ej. `MBT-EXTERNAL`)
- Cada trade importado queda enlazado 1:1 a la página de Notion de origen en `notion_import_links` (única por `notion_page_id`, así que volver a correr el script nunca duplica una operación)

## Por qué cada campo se mapea así

El Notion real ("📈 Trading Journal") no es un log de fills -- es una fila manual por operación ya cerrada, con un solo precio de entrada y uno de salida. Esto obliga a varias decisiones que no aplican al pipeline de Coinbase:

| Campo Notion | Destino | Razón |
|---|---|---|
| `Trade` (title) | -- (solo queda en `notion_import_links.raw_properties` para auditoría) | Es un rótulo libre que el usuario escribía a mano (a veces con `$`, a veces sin), no un dato estructurado. |
| `Fecha` (una sola fecha, sin hora) | `opened_at` **y** `closed_at`, ambos a medianoche UTC de ese día | Notion nunca registró hora de entrada/salida por separado. Poner ambos campos en el mismo instante es la opción honesta: `duration_seconds` sale en 0 en vez de inventar una duración. La fecha se ancla en UTC (no en la zona del usuario) para no arriesgar un corrimiento de día al convertir una fecha-sin-hora ambigua. |
| `Ticker` (multi-select) | `product_id` sintético | La mayoría de filas tiene un solo ticker. Cuando hay más de uno (p. ej. `MBT`+`MNQ`), Notion no dice a cuál de los dos corresponde el precio de entrada/salida registrado -- inventar esa asociación sería peor que ser explícito. Se crea un producto combinado (`MBT+MNQ-EXTERNAL`) y la operación queda marcada en sus notas para revisión manual. |
| `Entrada` / `Salida` = `0` | `entry_wap` / `exit_wap` = `null` (no `0`) | `0` no es un precio real de BTC/MBT/MNQ -- significa "no se registró". Guardar `0` sería mostrar un precio falso. |
| `Setup` (`A+`/`A`/`B`/`C`) | Tag `"Setup: X"` (tabla `tags`, vía `trade_tags`) | Es una nota de calidad del setup, no el nombre de una estrategia -- mezclarlo con `Estrategia` habría perdido la distinción que el propio usuario hacía. |
| `Estrategia` (multi-select) | `journal_entries.strategy_id` (solo el primer valor) + el resto listado en las notas | `strategy_id` es una sola FK; Notion permitía marcar varias. Se prioriza el primero y el resto queda visible, no se descarta. `"ninguna"/"ninguno"` se trata como "sin estrategia" (no crea una fila `strategies` vacía). |
| `Sesión` (multi-select: NY/TOKIO/SYDNEY/LONDON) | **Ninguno** (no se escribe `session_computed` ni `session_override`) | La clasificación de sesión de esta plataforma exige un instante real (hora exacta) para poder aplicar las reglas DST correctas -- ver `lib/sessions/classify.ts`. Como `Fecha` no tiene hora, calcular una sesión aquí sería una sesión inventada, no calculada. El valor que Notion traía se deja igualmente disponible dentro de las notas, sin usarlo para clasificar nada. |
| `Puntuación` (0-10) | Texto en las notas (`"Puntuación (Notion, escala 0-10): N"`) | `journal_entries.entry_quality` es 1-5 por restricción de la base de datos; reescalar 0-10 a 1-5 perdería precisión y podría producir un `0` inválido. Se conserva el número original en vez de forzarlo a otra escala. |
| `Emociones`, `Errores` (multi-select) | `emotional_state`, `mistake_tag` (texto, unidos con `", "`) | Estos campos de `journal_entries` son texto libre, no enumerados -- unir la lista es una conversión sin pérdida. |
| `trend ` (multi-select; nombre con espacio final en Notion) | `htf_bias` | Es el análogo más cercano ya existente en el esquema. |
| `Notas`, `Revisión post-trade`, `Donde ?`, `Seleccionar` | Todo dentro de `journal_entries.notes`, en secciones separadas y rotuladas | No hay un campo estructurado 1:1 para "dónde operabas" o "en vivo vs. solo" -- en vez de forzarlos a un campo que no encaja, quedan como texto legible, nunca se pierden. |
| `PnL` | `net_pnl` (tal cual, **sin recalcular**) | Los precios de Notion (`Entrada`/`Salida`) tienen inconsistencias de escala reales entre filas del mismo ticker (ver más abajo) -- recalcular el P&L a partir de esos precios habría producido cifras peores que las que el usuario ya validó a mano. El `PnL` de Notion se trata como la fuente de verdad; ver la nota de metodología que cada operación importada trae en sus propias notas. |
| `PnL` + `Comisiones` | `gross_pnl` (estimado: `PnL + Comisiones`) | Es una aproximación explícita, no un recálculo desde precios -- se documenta como tal en cada operación. |
| `Capturas`, `Plan pre-mercado` (archivos) | **No migrados todavía** -- se cuenta cuántos había y se deja una nota de aviso por operación, con enlace a la página original de Notion | Requiere descargar cada archivo de Notion y volver a subirlo al storage de esta plataforma; queda pendiente para una fase posterior. Nunca se oculta que faltan -- cada operación con archivos sin migrar lo dice explícitamente en sus notas. |

## Avisos que el script genera (y nunca oculta)

Por cada corrida con operaciones nuevas, se crea una notificación (`type='DISCREPANCY'`, visible en Actividad) con el resumen de:

- Cuántas operaciones tenían varios tickers combinados en una sola fila
- Cuántas tenían precio de entrada/salida sin registrar
- Cuántas tenían el `PnL` numérico inconsistente con el resultado marcado (p. ej. `PnL` positivo pero `Resultado = Perdedor` -- ocurrió varias veces en los datos reales del usuario; el número siempre gana sobre la etiqueta, pero la inconsistencia se señala para revisión)
- Cuántos archivos adjuntos quedaron sin migrar

Cada una de estas situaciones también queda anotada, operación por operación, dentro de `journal_entries.notes` -- nunca solo en el resumen agregado.

## Cuentas y productos que crea

Una fila `accounts` por cada valor distinto de la propiedad `Cuenta` de Notion que realmente aparezca en los datos (no una por cada opción *definida* en el select de Notion, aunque nunca se haya usado). Igual para los productos sintéticos por ticker. Esto evita cuentas o productos vacíos que no representan nada real.
