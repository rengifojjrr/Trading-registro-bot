# Esquema de base de datos

Postgres vía Supabase. Migraciones versionadas en `supabase/migrations/`, aplicadas en orden por nombre de archivo (timestamp). 12 migraciones, 32 tablas. Ver el comentario al inicio de cada migración para el razonamiento de esa tabla específica -- este documento es el resumen de alto nivel, no un sustituto de leer el SQL.

## Principios que rigen todo el esquema

1. **Cada tabla de dominio de usuario tiene `user_id` directo** (no solo alcanzable por join) y una política RLS `using ((select auth.uid()) = user_id)`. El `(select ...)` alrededor de `auth.uid()` es la guía de rendimiento documentada por Supabase: sin él, Postgres reevalúa la función en cada fila en vez de una vez por consulta.
2. **Capa cruda inmutable vs. capa procesada.** `raw_orders`/`raw_fills` reflejan exactamente lo que Coinbase devolvió. `trades`/`trade_fills`/etc. son enteramente derivables de la capa cruda + `trade_grouping_overrides`, y por lo tanto recalculables sin pérdida de información.
3. **Quién puede escribir cada tabla está codificado en las políticas RLS, no solo en la disciplina del código de la aplicación.** La mayoría de las tablas de "sistema" (`raw_fills`, `raw_orders`, `trades`, `trade_fills`, `sync_state`, `sync_runs`, `reconciliation_runs`, `stats_daily`, `position_snapshots`, `trade_price_extremes`, `notion_sync_links/queue/history`, `csv_imports/csv_import_rows`) solo tienen política de `SELECT` para el rol `authenticated`: únicamente el cliente de service role (`src/lib/supabase/admin.ts`, usado por trabajos del servidor) puede escribirlas. Las tablas donde el usuario introduce datos directamente (`journal_entries`, `strategies`, `tags`, `trade_tags`, `trade_screenshots`, `trade_comments`, `trade_grouping_overrides`, `notion_field_mappings`, `accounts`, `app_settings`, `profiles`) tienen CRUD completo para el propietario. `notifications` es un caso intermedio: `SELECT` + `UPDATE` (para `is_read`/`resolved_at`), sin `INSERT`/`DELETE` desde el cliente.
4. **`raw_fills` es inmutable incluso para el service role**: no existe política de `UPDATE` ni `DELETE`. Las correcciones de Coinbase llegan como filas nuevas (`trade_type = REVERSAL | CORRECTION | SYNTHETIC`).
5. **`products` es dato de referencia compartido, no propiedad de un usuario.** No tiene `user_id`; cualquier usuario autenticado puede leerlo, solo el service role lo escribe.

## Mapa de tablas por dominio

**Capa cruda**: `raw_orders`, `raw_fills`.

**Referencia**: `products` (especificaciones de contrato -- fuente del multiplicador para el motor de P&L).

**Capa procesada**: `trades`, `trade_fills` (junction con el invariante `unique(raw_fill_id, role)` para el caso de reversal), `trade_grouping_overrides` (mecanismo real de corrección manual), `trade_reconstruction_runs` (auditoría).

**Operación/sincronización**: `accounts`, `sync_state` (incluye `high_water_mark`, el ancla durable entre corridas -- distinto del `cursor` de Coinbase, que solo es válido dentro de una corrida paginada), `sync_runs`, `reconciliation_runs`, `reconciliation_discrepancies` (una fila por discrepancia individual, no un blob).

**Reporting**: `daily_balances`, `stats_daily`, `monthly_reports`, `position_snapshots` (snapshot de `/cfm/positions` para conciliar contra las operaciones OPEN reconstruidas), `trade_price_extremes` (MFE/MAE, tabla separada y nullable a propósito -- ver más abajo).

**Diario**: `strategies`, `tags`, `trade_tags`, `journal_entries` (1:1 con trade, campos subjetivos), `trade_screenshots`, `trade_comments`.

**Notion**: `notion_sync_links`, `notion_sync_queue`, `notion_field_mappings` (la única tabla de Notion editable por el usuario), `notion_sync_history`.

**Sistema**: `notifications`, `csv_imports`, `csv_import_rows`, `profiles`, `app_settings`, `audit_log`.

## Decisiones específicas que vale la pena explicar

### `trades.opening_fill_id` y por qué no se borra/reinserta en cada recálculo

Ver `docs/RECONCILIATION_RULES.md` sección 4. Resumen: el UUID de `trades.id` se preserva entre recálculos porque `journal_entries`, `trade_tags`, `trade_screenshots`, `trade_comments` y `notion_sync_links` lo referencian -- perder ese UUID en cada corrección del algoritmo de reconstrucción huérfanaría todo el contenido del diario.

### Sesión (`trades.session_computed` / `session_override` / `session_effective`)

La especificación original menciona "sesión" tanto como algo que debe clasificarse automáticamente con reglas DST correctas, como dentro de "campos manuales" -- probablemente porque así se hace hoy a mano en Notion, no porque sea una decisión de arquitectura deliberada. Este proyecto trata la sesión como **objetiva/derivada** (`session_computed`, calculada por `src/lib/sessions/classify.ts` a partir de `opened_at`), con un override manual opcional (`session_override`) para el caso raro de necesitar corregirla. `session_effective` es una columna generada (`COALESCE(session_override, session_computed)`) para que el resto de la aplicación nunca repita esa lógica.

Las tres columnas viven en `trades`, no en `journal_entries`: dado que "rendimiento por sesión" es un filtro/agregación de uso frecuente en el dashboard, colocarlas junto al resto de datos objetivos evita un join en cada consulta, aunque establecer el override sea técnicamente un acto manual.

### `trade_price_extremes` (MFE/MAE) como tabla separada

No son columnas en `trades` a propósito: no todas las operaciones tendrán un valor (depende de que haya histórico de velas disponible), y `is_approximate`/`granularity_used`/`unavailable_reason` hacen que el carácter opcional y aproximado de estos datos sea estructural -- no algo que la interfaz tenga que recordar aclarar. Ver `docs/COINBASE_INTEGRATION.md` pregunta abierta #6.

### `stats_daily` es una caché, no la única fuente de verdad

Se recalcula de forma determinista después de cada sincronización/conciliación exitosa. Sirve la carga rápida del dashboard sin filtros activos. En cuanto el usuario activa cualquier filtro (rango de fechas, producto, sesión, setup...), el dashboard debe calcular en vivo con las mismas funciones de `src/lib/analytics/` sobre el conjunto de operaciones filtrado -- nunca leer `stats_daily` para una vista filtrada. Dos caminos de cálculo que puedan divergir es exactamente cómo se rompería en silencio el requisito de que "los filtros afecten coherentemente todas las métricas".

### `numeric` en Postgres, `string` en TypeScript

Todas las columnas de precio/tamaño/comisión/P&L son `numeric` en Postgres (nunca `float`/`real`, para no perder precisión). `@supabase/supabase-js` las serializa como `string` sobre HTTP, y `src/types/database.ts` las tipa como `string` en consecuencia -- nunca `number`. El motor de P&L (Fase 3) debe operar sobre estos valores con una librería de precisión decimal (`decimal.js`, ya añadida a las dependencias) en vez de aritmética de punto flotante nativa de JavaScript.

### `Relationships: []` en cada tabla de `src/types/database.ts`

Requerido por el tipo `GenericTable` de `@supabase/postgrest-js`, no solo un adorno: omitirlo hace que todo el mapa de `Tables` deje de coincidir estructuralmente con lo que el cliente espera, y la inferencia de tipos de cada `Row`/`Insert`/`Update` colapsa silenciosamente a `never`. Si añades una tabla nueva a mano (en vez de regenerar con `supabase gen types`), no olvides este campo.

## Regenerar los tipos desde un proyecto real

Una vez que exista un proyecto Supabase real y las migraciones estén aplicadas:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

Vuelve a aplicar a mano los comentarios y el tipo `SessionLabel` que este archivo tiene actualmente, ya que `supabase gen types` no los preserva.
