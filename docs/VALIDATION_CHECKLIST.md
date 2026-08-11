# Checklist de validación antes de activar la sincronización automática

Este documento es el procedimiento obligatorio antes de que `app_settings.auto_sync_enabled` pase a `true` para cualquier cuenta. No es opcional ni una formalidad: es la única defensa real contra un error silencioso en el motor de reconstrucción que produzca cifras de P&L incorrectas de forma consistente.

**No lo saltes aunque el motor pase todos sus tests automáticos.** Los tests automáticos (Fase 3) verifican que el código haga lo que el código dice que debe hacer. Esta validación verifica que lo que el código dice que debe hacer coincida con la realidad de tu historial de Coinbase.

## Requisitos previos

- [ ] La suite de tests del motor de reconstrucción (`src/lib/reconstruction/*.test.ts`) está en verde, cubriendo todos los casos listados en `docs/RECONCILIATION_RULES.md`.
- [ ] La suite de tests del motor de P&L (`src/lib/pnl/*.test.ts`) está en verde, cubriendo todos los casos listados en `docs/PNL_METHODOLOGY.md`.
- [ ] Tienes una clave de Coinbase CDP con permiso **únicamente `view`** configurada en variables de entorno del servidor (nunca en el chat, nunca en el repositorio).
- [ ] `COINBASE_PRODUCT_ID` / `COINBASE_PRODUCT_VENUE` apuntan exactamente al contrato que operas.

## Procedimiento

1. Ejecuta una importación histórica completa (Fase 2/3) contra tu cuenta real de Coinbase, en modo de solo lectura, sin activar todavía la sincronización automática de 5 minutos.
2. De las operaciones reconstruidas, selecciona **entre 20 y 50** que abarquen la mayor variedad posible de casos reales: operaciones simples, con entradas/salidas parciales, con aumento o reducción de posición, y si tu historial las tiene, al menos un reversal long↔short.
3. Para cada operación seleccionada, compara manualmente contra el historial de Coinbase (la interfaz de Coinbase Advanced, o el CSV de fills que puedas exportar desde ahí):
   - [ ] Dirección (long/short) correcta.
   - [ ] Fecha/hora de apertura y cierre correctas (verifica que la zona horaria mostrada sea la que configuraste, no UTC ni la del servidor).
   - [ ] Cantidad total y tamaño máximo correctos.
   - [ ] Precio promedio ponderado de entrada y de salida correctos (dentro de un margen de redondeo razonable).
   - [ ] Comisiones totales correctas.
   - [ ] P&L bruto y neto correctos, verificados a mano con la fórmula de `docs/PNL_METHODOLOGY.md` para al menos 5 de las operaciones.
   - [ ] Ninguna operación de tu historial real quedó fuera silenciosamente (compara el conteo total de operaciones cerradas en el período contra tu propio conteo manual).
4. Registra el resultado: cuántas operaciones se compararon, cuántas coincidieron exactamente, y el detalle de cualquier diferencia encontrada.

## Criterio de aprobación

**Cero diferencias materiales.** Una diferencia material es cualquiera que afecte P&L, dirección, cantidad, o fechas. Diferencias de redondeo en el último decimal no son materiales; una operación con la dirección invertida, o un P&L distinto, sí lo son.

Si aparece cualquier diferencia material:

1. No actives `auto_sync_enabled`.
2. Documenta el caso exacto (el/los `entry_id` de los fills involucrados, y qué se esperaba vs. qué se obtuvo).
3. Corrige la regla de reconstrucción o de P&L correspondiente en `docs/RECONCILIATION_RULES.md` / `docs/PNL_METHODOLOGY.md` primero, luego el código, luego añade el caso como test automático permanente.
4. Vuelve a ejecutar esta validación desde el paso 1.

## Después de aprobar

Solo entonces:

- [ ] Activa `auto_sync_enabled` en Configuración.
- [ ] Confirma en la página de Actividad que la primera corrida automática (∼5 min después) se completó sin discrepancias nuevas.
- [ ] Programa (o confirma que ya está programada) la conciliación nocturna.

La sincronización automática que se activa después de esto sigue sujeta a la conciliación nocturna y a las notificaciones internas (`DISCREPANCY`, `UNCLASSIFIED_FILL`, `MISSING_CONTRACT_SPEC`, `CALC_UNVERIFIED`) -- pasar esta validación una vez no exime de seguir revisando esas notificaciones cuando aparezcan.
