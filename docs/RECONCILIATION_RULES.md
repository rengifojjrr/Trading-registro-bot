# Reglas de reconstrucción de operaciones

Este documento especifica cómo `raw_fills` (Fase 2) se convierte en `trades` (Fase 3). El motor (`src/lib/reconstruction/engine.ts`, aún no implementado) debe ser una función pura, sin efectos secundarios, que implemente exactamente estas reglas -- y la suite de tests de la Fase 3 debe cubrir cada regla nombrada aquí por su nombre.

> Nota de vocabulario: "agrupar" en este documento se refiere siempre a la reconstrucción de los límites de una operación a partir de fills (una cuestión de integridad de datos, gobernada solo por la regla de ciclo de vida de posición de abajo). Nunca se refiere a agregación para análisis (por ejemplo, "sumar P&L por día de la semana" en el dashboard) -- son dos usos no relacionados de la misma palabra.

## 1. Orden de procesamiento

Los fills se procesan en orden cronológico estricto por `(account_id, product_id)`, ordenados por `sequence_timestamp`, luego `trade_time`, luego `entry_id` como desempate estable. Nunca se agrupan fills solo porque compartan fecha o producto.

## 2. Ciclo de vida de una operación

Se mantiene una posición firmada acumulada por `(account_id, product_id)`: `BUY` suma, `SELL` resta. Una operación (`trade`) nace en la transición `0 → ≠0` y muere en la transición `≠0 → 0`.

- Fills que **alejan** la posición de cero son `ENTRY`: ponderan el precio de entrada (WAP = precio promedio ponderado por tamaño).
- Fills que **acercan** la posición a cero son `EXIT`: ponderan el precio de salida.
- Una operación puede tener múltiples `ENTRY` (aumentos de posición / entradas parciales) y múltiples `EXIT` (reducciones / salidas parciales) antes de cerrar.

## 3. Reversal (long → short o short → long)

Si un fill haría que la posición cruce cero y cambie de signo, se **divide** en dos porciones asignadas (tabla `trade_fills`):

- La porción que cierra la operación existente (`role = EXIT` en el trade que se cierra).
- La porción que abre una operación nueva e independiente (`role = ENTRY` en el trade nuevo), al mismo precio de fill.

Ambas porciones referencian el **mismo** `raw_fills.entry_id`. La restricción `unique(raw_fill_id, role)` en `trade_fills` es el invariante de esta regla a nivel de base de datos: un fill puede ser `ENTRY` como máximo una vez y `EXIT` como máximo una vez, en dos operaciones distintas cuando corresponde.

**Prorrateo de comisión**: la comisión del fill dividido se reparte proporcionalmente al tamaño asignado a cada porción. Esto es una asunción documentada y testeada -- Coinbase no indica cómo repartir la comisión de un fill dividido, y no existe otra regla obviamente más correcta.

## 4. Identidad estable y recálculo (sin perder datos del diario)

`trades.opening_fill_id` es el `raw_fills.entry_id` que abrió la operación (la porción que llevó la posición de 0 a ≠0, o la porción sobrante de un fill de reversal). Es único por `(account_id, product_id)`.

La reconstrucción **nunca borra y reinserta**. Es un *diff-and-upsert* contra `opening_fill_id`:

- Si ya existe un trade con ese `opening_fill_id`, se actualiza en el mismo `id` (preservando el UUID).
- Si no existe, se inserta uno nuevo.
- Un trade solo se elimina si su fill de apertura deja de producir una operación bajo la lógica nueva (caso raro) -- y eso genera una notificación (`TRADE_BOUNDARY_CHANGED` en `reconciliation_discrepancies`), nunca una eliminación silenciosa.

Esto es lo que permite corregir la lógica de agrupación más adelante y reconstruir todo el historial **sin huérfanar** `journal_entries`, `trade_tags`, `trade_screenshots`, `trade_comments` ni `notion_sync_links` -- todas referencian `trades.id`, que se preserva.

`trades.reconstruction_version` registra qué versión del algoritmo produjo cada fila.

## 5. Corrección manual (`trade_grouping_overrides`)

La corrección manual de una agrupación (requisito: "poder corregir manualmente... y volver posteriormente a la reconstrucción automática") **no** edita `trades` ni `raw_fills` directamente. Se expresa como una fila en `trade_grouping_overrides` (`override_type`: `MERGE | SPLIT | REASSIGN | EXCLUDE_FILL`, `is_active`).

El motor de reconstrucción lee las overrides activas de un `(account_id, product_id)` y las aplica de forma determinista **como parte de la misma función pura** que aplica la regla automática de ciclo de vida -- así, un recálculo completo sigue siendo 100% reproducible (reglas automáticas + overrides activas), y "volver a la reconstrucción automática" es simplemente desactivar la override (`is_active = false`) y volver a ejecutar la reconstrucción.

`trades.is_manually_adjusted` es un indicador de solo lectura derivado (si una override activa dio forma a esta operación), no el mecanismo en sí.

## 6. Datos crudos vs. procesados

`raw_fills` es inmutable (sin política de `UPDATE`/`DELETE`, ni siquiera para el service role -- ver `supabase/migrations`). Las correcciones de Coinbase llegan como fills nuevos (`REVERSAL`/`CORRECTION`/`SYNTHETIC`), nunca como edición de una fila existente. `trades` y `trade_fills` son enteramente derivables de `raw_fills` + `trade_grouping_overrides`, y por lo tanto recalculables desde cero en cualquier momento.

## 7. Idempotencia de la sincronización

La clave de idempotencia de un fill es `entry_id` (no `trade_id`, que Coinbase no garantiza único para fills de ajuste). Ejecutar la sincronización varias veces sobre la misma ventana nunca duplica fills (restricción `PRIMARY KEY` en `raw_fills.entry_id`) ni operaciones (`unique(account_id, product_id, opening_fill_id)` en `trades`).

## 8. Liquidaciones de Coinbase (`trades.liquidated_qty`)

Una liquidación de margen **no cambia ninguna regla anterior**: sus fills llegan por el mismo endpoint, con `trade_type = FILL`, y el motor los trata como las salidas que son. Lo único que las distingue es la orden a la que pertenecen, que viene con `order_type = LIQUIDATION` (ver `docs/COINBASE_INTEGRATION.md`).

Lo que sí cambia es lo que la aplicación **dice**. Que una posición baje de 78 a 50 contratos sin que hayas tocado nada parece un fallo de sincronización, y no lo es; y no distinguir los dos casos es lo que hace que un usuario deje de creerse las cifras. Por eso:

- `trades.liquidated_qty` es la suma de `trade_fills.allocated_size` con rol `EXIT` cuya orden (`raw_fills.order_id → raw_orders`) es una liquidación. Es un derivado, como `is_manually_adjusted`: lo recalcula `refresh_trade_liquidations(p_user_id, p_product_id)` al final de cada `persistReconstruction`, salga de donde salga la reconstrucción, y el RPC `persist_reconstruction` no lo toca, así que sobrevive a los recálculos.
- Un fill dividido por un reversal (regla 3) reparte también su condición de liquidación: cada operación cuenta sólo la porción que le tocó.
- La ficha de la operación y la lista marcan la operación como liquidada, y el historial de fills señala cada ejecución que fue de Coinbase.
- Cada orden de liquidación **nueva** (con fills recién guardados) levanta un aviso `LIQUIDATION`, con clave de deduplicación por `order_id`, así que una orden avisa una vez aunque la ventana de solape la traiga varias veces.

No se confirma todavía el cierre por **vencimiento** de un contrato `EXPIRING`; si llega también como orden de liquidación, esta regla lo cubre sin cambios.

## Casos que la suite de tests de la Fase 3 debe cubrir explícitamente

1. Long simple, entrada y salida únicas, cierre completo.
2. Short simple, entrada y salida únicas, cierre completo.
3. Múltiples entradas parciales (aumento de posición) antes de cualquier salida.
4. Múltiples salidas parciales (reducción de posición) antes del cierre completo.
5. Combinación de aumento y reducción antes del cierre.
6. Reversal long → short: el fill que cruza cero se divide correctamente; la comisión se prorratea exactamente (la suma de las porciones debe igualar el fill original).
7. Reversal short → long.
8. Orden parcialmente ejecutada (los fills reflejan solo la cantidad ejecutada; la cantidad no ejecutada nunca genera un fill, así que no requiere manejo especial).
9. Comisiones distintas por fill.
10. Contrato con vencimiento (`contract_expiry_type = EXPIRING`) -- sujeto al punto sin confirmar #4 de `docs/COINBASE_INTEGRATION.md`.
11. Ejecutar la reconstrucción dos veces sobre el mismo conjunto de fills produce exactamente los mismos `trades.id` (prueba de idempotencia/diff-upsert).
12. Una `trade_grouping_overrides` activa cambia el resultado de la reconstrucción de forma determinista; desactivarla y recalcular vuelve exactamente al resultado automático.
