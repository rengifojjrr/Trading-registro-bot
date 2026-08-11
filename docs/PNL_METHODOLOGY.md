# Metodología de cálculo de P&L

**Estado: especificado y usado para los datos demo (`scripts/seed-demo-data.ts`); la implementación como motor reutilizable (`src/lib/pnl/calculate.ts`) es trabajo de la Fase 3.** Este documento existe ahora, antes de esa implementación, para que la fórmula se revise y apruebe como texto antes de convertirse en código.

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

## Lo que este documento NO cubre todavía

- **Divisa de liquidación distinta a USD**: no confirmado que sea necesario para el producto que operas; si tu contrato liquida en otra divisa, esta fórmula necesita un paso de conversión adicional que aún no está diseñado.
- **Funding de perpetuos**: los contratos perpetuos (`contract_expiry_type = PERPETUAL`) pueden tener pagos de funding periódicos que no son fills de trading. No están contemplados en esta fórmula todavía -- si operas un perpetuo, esto debe confirmarse antes de confiar en el P&L neto reportado.
- **MFE / MAE**: metodología separada, ver `docs/COINBASE_INTEGRATION.md` (pregunta abierta #6) -- depende de un endpoint de velas históricas aún no investigado.

## Pruebas requeridas antes de conectar credenciales reales (Fase 3)

Casos mínimos en `src/lib/pnl/calculate.test.ts`: long, short, entrada parcial, salida parcial, aumento de posición, reducción de posición, reversal, cierre completo -- reutilizando los mismos fixtures de `src/lib/coinbase/venues/mock.ts` que ya sirven a los datos demo, para que el motor y los datos demo nunca puedan divergir silenciosamente sobre el mismo escenario.
