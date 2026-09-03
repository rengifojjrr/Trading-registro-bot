# Metodología de cálculo de P&L

**Estado: implementado en `src/lib/pnl/calculate.ts` (realizado), `src/lib/pnl/unrealized.ts` (flotante) y `src/lib/reconstruction/engine.ts` (lotes FIFO), con pruebas en cada uno.** Este documento es la fuente de verdad: el código tiene que coincidir con él, no al revés.

## Principio

Esto es matemática de **futuros**, no de spot. Un futuro se opera en contratos, cada uno con un tamaño/multiplicador fijo (`products.contract_size`, tomado siempre del registro de productos -- nunca hardcodeado). El P&L no es simplemente "precio de salida menos precio de entrada": hay que multiplicar por el tamaño de contrato para obtener el resultado en la moneda de liquidación.

## Fórmula

Para una operación con dirección `d ∈ {LONG, SHORT}`, tamaño cerrado `q` (contratos), precio promedio ponderado de entrada `WAP_entry`, precio promedio ponderado de salida `WAP_exit`, y multiplicador de contrato `m`:

```
P&L bruto = (WAP_exit − WAP_entry) × q × m                          si d = LONG
P&L bruto = (WAP_entry − WAP_exit) × q × m                          si d = SHORT

P&L neto  = P&L bruto − (comisiones de entrada + comisiones de salida)

Valor nocional  = WAP_entry × cantidad total de entrada × m
% de rentabilidad = P&L neto / Valor nocional × 100
```

`WAP_entry` y `WAP_exit` son promedios ponderados por tamaño sobre **todos** los fills de entrada/salida de la operación (ver `docs/RECONCILIATION_RULES.md` para cómo se determina qué fill es entrada y cuál es salida, incluyendo el caso de reversal).

## Ejemplo verificado (dato demo, escenario 1)

Producto: `BIT-DEMO-CDE`, `contract_size = 0.01`.

- Entrada: BUY 3 contratos @ 61200.00, comisión 1.80.
- Salida: SELL 3 contratos @ 61850.00, comisión 1.86.

```
P&L bruto = (61850.00 − 61200.00) × 3 × 0.01 = 19.50
P&L neto  = 19.50 − (1.80 + 1.86)             = 15.84
Nocional  = 61200.00 × 3 × 0.01               = 1836.00
% rentabilidad = 15.84 / 1836.00 × 100        ≈ 0.8627 %
```

Este y los otros cuatro escenarios (short simple, entradas/salidas parciales múltiples, y un reversal con prorrateo de comisión) están calculados a mano en `scripts/seed-demo-data.ts` -- son el primer conjunto de "respuestas correctas conocidas" contra las que la Fase 3 debe validar el motor real antes de confiar en él con datos de Coinbase reales.

## Operación abierta: lo cobrado y lo flotante se reparten por lotes FIFO, como Coinbase

La fórmula de arriba da el P&L **total** de una operación, y para una operación cerrada no hay más que decir. Para una que sigue abierta hay dos cifras -- lo ya cobrado de los contratos cerrados y lo flotante de los que quedan -- y **cómo se reparte el total entre las dos depende de a qué precio se considera que entró cada contrato que se cierra**. Coinbase lo hace por lotes, cerrando siempre el más antiguo primero (FIFO):

- Cada salida realiza `(precio de salida − precio del lote más antiguo que queda) × contratos × m` (al revés en corto), consumiendo ese lote.
- El «precio de entrada de la posición» que enseña Coinbase (`avg_entry_price` en `/cfm/positions`) es la media ponderada de los lotes que **quedan**, no de todas las entradas. Es `trades.open_lots_wap`, y es sobre lo que se calcula el flotante (`calculateUnrealizedPnl`).
- Mientras la operación está abierta, `trades.gross_pnl` / `net_pnl` son lo realizado por FIFO (`fifoRealizedPoints × m`, menos comisiones). Al cerrar, FIFO y los WAP dan exactamente lo mismo, y se usa la fórmula de los WAP para que las cifras guardadas no cambien ni en el último decimal.

Las dos cosas coinciden mientras sólo añades o sólo reduces. Se separan en cuanto **recompras después de cerrar parte**: la media de todas las entradas mezcla contratos que ya no están con los que siguen, y el flotante calculado sobre ella no es el de ningún contrato real.

### Ejemplo verificado contra Coinbase (BIP-20DEC30-CDE, 1 y 2 de septiembre de 2026)

`contract_size = 0.01`. Entradas y salidas, en orden:

| Paso | Fills | Lotes abiertos después |
|---|---|---|
| Compras | 1 @ 77 115, 39 @ 77 115, 10 @ 76 940 | 40 @ 77 115, 10 @ 76 940 |
| Liquidación 1 (vende 28: 5 @ 77 365, 16 @ 77 355, 4 @ 77 345, 3 @ 77 315) | realiza 6 610 puntos = **66,10 $** | 12 @ 77 115, 10 @ 76 940 |
| Recompra | 2 @ 77 280, 26 @ 77 285 | 12 @ 77 115, 10 @ 76 940, 2 @ 77 280, 26 @ 77 285 |
| Liquidación 2 (vende 28: 6 @ 77 465, 22 @ 77 460) | realiza 10 430 puntos = **104,30 $** | 22 @ 77 285 |

Coinbase reportó para la posición resultante `number_of_contracts = 22`, `avg_entry_price = 77 284,77` y `daily_realized_pnl = 104,25`. La diferencia con 77 285 / 104,30 es un contrato a 77 280 en vez de 77 285 -- el orden de dos fills del mismo instante dentro de la misma orden -- y vale 0,05 $.

Con la media de **todas** las entradas (77 153,46) el flotante de los 22 contratos a 77 225 salía **+15,74 $**; por lotes es **−13,15 $**, que es lo que enseñaba Coinbase (con su precio de marca, −18,65 $). La suma realizado + flotante es la misma con las dos formas de contar; lo que cambia es qué parte ya está en la cuenta y qué parte depende del precio, y eso es justo lo que se mira para decidir si cerrar.

## Lo que este documento NO cubre todavía

- **Divisa de liquidación distinta a USD**: no confirmado que sea necesario para el producto que operas; si tu contrato liquida en otra divisa, esta fórmula necesita un paso de conversión adicional que aún no está diseñado.
- **Funding de perpetuos**: los contratos perpetuos (`contract_expiry_type = PERPETUAL`) pueden tener pagos de funding periódicos que no son fills de trading. No están contemplados en esta fórmula todavía -- si operas un perpetuo, esto debe confirmarse antes de confiar en el P&L neto reportado.
- **MFE / MAE**: metodología separada, ver `docs/COINBASE_INTEGRATION.md` (pregunta abierta #6) -- depende de un endpoint de velas históricas aún no investigado.

## Pruebas requeridas antes de conectar credenciales reales (Fase 3)

Casos mínimos en `src/lib/pnl/calculate.test.ts`: long, short, entrada parcial, salida parcial, aumento de posición, reducción de posición, reversal, cierre completo -- reutilizando los mismos fixtures de `src/lib/coinbase/venues/mock.ts` que ya sirven a los datos demo, para que el motor y los datos demo nunca puedan divergir silenciosamente sobre el mismo escenario.
