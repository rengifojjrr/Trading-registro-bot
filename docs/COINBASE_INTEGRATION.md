# Integración con Coinbase Advanced Trade

Este documento es el registro vivo de lo que está **confirmado** contra la documentación oficial de Coinbase (`docs.cdp.coinbase.com`), y de lo que sigue **sin confirmar**. La regla del proyecto es simple: si no está en este documento como confirmado, el código no debe asumirlo.

Investigación inicial realizada: 2026-08-11.

## Hallazgo crítico de calendario

**Los endpoints de INTX (futuros perpetuos internacionales) se retiran el 9 de septiembre de 2026**, reemplazados por un "Deribit-powered gateway" que a la fecha de esta investigación **no tiene documentación pública**. Esto ocurre dentro de las próximas semanas desde que se escribió este documento.

Consecuencias para el diseño:
- `FCM` (Coinbase Financial Markets, futuros regulados por la CFTC en EE. UU.) es el venue por defecto recomendado (`COINBASE_PRODUCT_VENUE=FCM`), no `INTX`.
- El adaptador INTX (`src/lib/coinbase/venues/intx.ts`) está marcado explícitamente como experimental/deprecado en el código.
- Cuando el nuevo gateway se documente, solo ese archivo debería cambiar -- ni el motor de reconstrucción ni el resto de la aplicación dependen de los detalles de un venue específico, gracias a la interfaz `MarketDataPort` (`src/lib/coinbase/ports.ts`).

## Autenticación

- Claves de Coinbase Developer Platform (CDP), no las claves HMAC legacy de Coinbase Exchange.
- JWT de corta duración (120 segundos, confirmado), firmado por request.
- Tipo de clave: Ed25519 (PEM PKCS8) o ECDSA P-256 (PEM SEC1) -- el algoritmo correcto (`EdDSA` o `ES256`) se detecta automáticamente a partir del material de la clave, igual que hacen los SDKs oficiales de Coinbase.
- Estructura del JWT (confirmada contra la guía de autenticación de CDP y el generador de JWT del SDK oficial en Python):
  - Header: `{ alg, kid: <nombre de la clave>, nonce: <hex aleatorio>, typ: "JWT" }`
  - Payload: `{ sub: <nombre de la clave>, iss: "cdp", nbf: ahora, exp: ahora + 120, uri: "<MÉTODO> <host><path>" }`
  - Header HTTP: `Authorization: Bearer <jwt>`
- Scopes disponibles: `view` (solo lectura, nunca mueve fondos), `trade`, `transfer`. **Esta aplicación solo debe solicitar `view`.**
- Implementado y probado con clave de prueba generada en el momento (nunca una credencial real) en `src/lib/coinbase/jwt.ts` / `jwt.test.ts`.

## Endpoints confirmados

| Endpoint | Método | Uso |
|---|---|---|
| `/api/v3/brokerage/orders/historical/fills` | GET | Fuente de los fills. Compartido entre venues (filtrable por `product_types`, incluye `FUTURE`). Paginado por `cursor`/`limit`. |
| `/api/v3/brokerage/orders/historical/batch` | GET | Lista de órdenes históricas. |
| `/api/v3/brokerage/orders/historical/{order_id}` | GET | Detalle de una orden. |
| `/api/v3/brokerage/products` | GET | Lista de productos. |
| `/api/v3/brokerage/products/{product_id}` | GET | Especificación de un producto, incluye `future_product_details`. |
| `/api/v3/brokerage/cfm/positions` | GET | Posiciones abiertas -- **solo CFM**. Usado para conciliación, no para ingestión de fills. |
| `/api/v3/brokerage/cfm/balance_summary` | GET | Balance de la cuenta de futuros -- solo CFM. |

### `GET /orders/historical/fills` -- esquema de respuesta (confirmado)

Campo por fill: `entry_id` (identificador único del fill -- **la clave de idempotencia correcta**), `trade_id` (único solo para `trade_type=FILL`, no para ajustes), `order_id`, `trade_time`, `trade_type` (`FILL | REVERSAL | CORRECTION | SYNTHETIC`), `price`, `size`, `commission`, `product_id`, `sequence_timestamp`, `liquidity_indicator` (`MAKER|TAKER`), `size_in_quote`, `side` (`BUY|SELL`), `retail_portfolio_id`, `commission_detail_total` (desglose), `future_legs` (fills de combos, normalmente vacío).

Parámetros de consulta: `order_ids`, `trade_ids`, `product_ids`, `product_types` (incluye `FUTURE`), `order_side`, `start_sequence_timestamp`, `end_sequence_timestamp`, `cursor`, `limit` (default 100), `sort_by`.

### `GET /products/{product_id}` -- `future_product_details` (confirmado)

`contract_code`, `contract_expiry` (ausente para perpetuos), `contract_expiry_timezone`, `contract_size` (**el multiplicador real del contrato** -- nunca lo hardcodees), `contract_root_unit`, `contract_expiry_type` (`EXPIRING | PERPETUAL`), `risk_managed_by` (`MANAGED_BY_FCM | MANAGED_BY_VENUE`), `funding_rate`/`funding_time`/`funding_interval` (perpetuos), `product_venue` (`CBE | FCM | INTX | UNKNOWN_VENUE_TYPE`).

Confirmado también: CFM (`FCM`) ya no es solo contratos con vencimiento -- desde el lanzamiento de "US Perpetual-Style Futures", también existen contratos perpetuos (`contract_expiry_type=PERPETUAL`) bajo el mismo venue `FCM`, regulados por la CFTC igual que los contratos con vencimiento.

### Producto de referencia (ejemplo confirmado)

Nano Bitcoin Futures (`BIT`): tamaño de contrato 0.01 BTC, liquidación en efectivo, `product_id` con forma `BIT-<fecha-expiración>-CDE` para el contrato con vencimiento.

### Liquidaciones de margen (confirmado con datos reales)

Cuando el margen no alcanza, Coinbase cierra parte o toda la posición por su cuenta. Llega así:

- Una **orden** con `order_type = "LIQUIDATION"` e `is_liquidation = true` (la documentación de `GET /orders/historical/{order_id}` lista `LIQUIDATION` como «special order type used to liquidate a position»). Es la única marca: los fills no llevan ninguna.
- Sus **fills** entran por `GET /orders/historical/fills` como los de cualquier otra orden, con `trade_type = "FILL"`, `liquidity_indicator = "TAKER"` y comisión normal. El motor de reconstrucción los aplica como cierres reales a precios reales, que es lo correcto.

Evidencia: la orden `07b1d9b4-…` del 1 de septiembre de 2026 (20:05 UTC) vendió 28 contratos de `BIP-20DEC30-CDE` en siete fills de entre 2 y 7 contratos.

Consecuencias en la aplicación:

- `raw_orders.order_type` se rellena en cada sincronización (antes se quedaba en `null` y la marca sólo vivía dentro de `raw_payload`).
- `trades.liquidated_qty` dice cuántos contratos de salida de cada operación los ejecutó una liquidación; lo recalcula `refresh_trade_liquidations` tras cada reconstrucción.
- Cada orden de liquidación nueva levanta un aviso `LIQUIDATION` (crítico, con correo) que dice cuántos contratos, a qué precio medio y en cuántas ejecuciones.
- La ficha de una operación abierta compara **contratos** con `/cfm/positions` antes que P&L: si Coinbase tiene menos que aquí, lo dice y pide una sincronización en el acto. Un cierre que Coinbase ejecuta solo no avisa a nadie, y con la sincronización automática apagada la aplicación sólo se entera cuando pregunta.

## Sin confirmar -- no asumir en el código

Estas son preguntas abiertas. El motor de reconstrucción (Fase 3) debe encapsular cada una detrás de una regla documentada y testeada, o rechazar/marcar el fill como "sin clasificar" (`notifications.type = UNCLASSIFIED_FILL`) en vez de adivinar.

1. **Semántica numérica de `REVERSAL` / `CORRECTION` / `SYNTHETIC`.** Confirmado que existen como valores de `trade_type`, pero no está confirmado si afectan la posición igual que un `FILL` normal o si requieren tratamiento especial. Hasta confirmarlo, cualquier fill con `trade_type != 'FILL'` debe marcarse para revisión manual, no procesarse silenciosamente.
2. **`future_legs` no vacío (fills de combo).** No hay semántica de un solo tramo confirmada para combos. El motor debe rechazar/marcar estos fills, no tratarlos como un fill simple.
3. **`size_in_quote = true`.** No hay ejemplo confirmado de cómo esto afecta el tamaño reportado en un fill de futuros. Necesita una rama explícita y testeada, no una suposición.
4. **Cierre forzado al expirar un contrato.** Sigue sin confirmarse si el cierre de una posición abierta al vencer un contrato `EXPIRING` llega como un `FILL` normal o como un registro fuera de banda que el motor no vería. Lo que **sí** está confirmado es la otra liquidación, la de margen -- ver «Liquidaciones de margen» más abajo.
5. **Alcance exacto de la deprecación de INTX.** Confirmado que los endpoints de perpetuos internacionales se retiran; no confirmado si "INTX" como valor de `product_venue` desaparece por completo de `/products` y `/orders/historical/fills`, o si esos endpoints compartidos siguen funcionando para datos históricos después del corte.
6. **Endpoint de velas históricas para MFE/MAE.** Se mencionó `GET /products/{product_id}/candles` en el listado general de endpoints, pero no se investigó su granularidad, ventana máxima de histórico ni límites de tasa. Requerido antes de construir `lib/analytics/mfe-mae.ts` (ver plan del proyecto). Mientras tanto, esa función permanece modular y sin conectar.
7. **Límites de tasa exactos.** Confirmado que existen headers `CB-RATE-LIMIT-LIMIT` / `CB-RATE-LIMIT-REMAINING`, pero no un número concreto de requests/segundo por endpoint. El cliente HTTP de Fase 2 debe leer estos headers en tiempo real en vez de asumir un límite fijo.

## Dato que falta proporcionar

El `product_id` exacto que operas. Configurable vía `COINBASE_PRODUCT_ID` / `COINBASE_PRODUCT_VENUE` en variables de entorno (ver `.env.example`). Se obtiene desde el ticket de orden en Coinbase Advanced, o con una llamada `GET /products` una vez que exista una clave de solo lectura.
