# Análisis de `trading/` — Auditoría de la auditoría

Revisión del contenido subido en el commit `e100761`. Este documento **no** es un backtest:
no hay acceso a TradingView desde este entorno. Es una revisión de código, de coherencia
interna y de metodología sobre los tres reportes que hay en la carpeta.

---

## 1. Qué hay realmente en la carpeta

La carpeta no contiene la estrategia ejecutable. Contiene **generadores de PDF** (ReportLab)
y sus salidas. El Pine Script existe sólo como *strings* dentro de los `.py`.

| Archivo | Qué es | Estrategia que documenta |
|---|---|---|
| `BTC_Strategy_Report.html` / `_EN.html` / `_EN.pdf` | Informe comercial | **A** — Donchian long-only |
| `generate_audit_pdf.py` / `_EN.py` / `_EN2.py` + 3 PDFs | Auditoría de 23–26 pág. | **B** — Donchian Long+Short |
| `generate_fund_pdf.py` | Presentación institucional | **C** — v3ADX (SuperTrend + ADX) |
| `debug.log` | Crash de Chromium, 169 bytes | ruido |

`generate_audit_pdf.py` y `_EN.py` son el **mismo archivo traducido** (1327 líneas cada uno,
1554 líneas de diff). `_EN2.py` es una tercera variante de 1171 líneas. Tres copias del mismo
contenido mantenidas a mano.

---

## 2. El problema principal: los tres documentos se contradicen

No son tres versiones de una estrategia. Son **tres estrategias distintas**, cada una
declarándose ganadora, y cada una descalificando a las otras.

| | **A** long-only | **B** Long+Short | **C** v3ADX |
|---|---|---|---|
| Entrada | Donchian(12) + EMA200 4H | ídem + short DC(4) cierres + Daily EMA50 | Daily EMA21/55 + SuperTrend + ADX≥20 |
| Salida | SL 2×ATR / TP 2.5R | ídem + SL 1.5×ATR / TP 4R | Trailing 12%/5% + hard stop 15%/8% |
| Período | Dic 2023 – May 2026 | Dic 2023 – May 2026 | **Dic 2020 – May 2026** |
| Trades | 96 | 97 (67L + 30S) | 60 (16L + 44S) |
| Net P&L 1× | +108.38% | **+537.91%** | +167% |
| Max DD | 17.37% | **12.03%** | 10.17% |
| Win rate | 37.5% | 41.24% | 20.00% |
| **Ritmo mensual 1×** | **2.61%/mes** | **6.72%/mes** | **1.50%/mes** |

Tres expectativas incompatibles para el mismo activo. Y peor, se refutan entre sí:

- **A** probó "Long + Short por régimen EMA" → **+29.84%, "Mucho peor"**.
  **B** es exactamente eso y reporta **+537.91%, "mejora todos los indicadores"**.
- **A** probó "Supertrend exit en lugar de TP fijo" → **+74.18%, "Peor"**.
  **C** usa SuperTrend como núcleo y se declara Pareto-óptima.
- **C** probó "DC Breakout hybrid" (= la estrategia de A y B) → **−27%, descartada**.

La diferencia A→B se explica por el fix de `ta.lowest(low)` → `ta.lowest(close)`, que está
bien documentado en §6.2 del audit. Pero **A sigue en el repo sin marcar como obsoleto**, y
C contradice a ambas sobre un período más largo. Nada indica cuál es la vigente.

---

## 3. Hallazgos en el código Pine

### 3.1 Los stops NO son fijos — flotan con la volatilidad (impacto alto)

El código reemite `strategy.exit` **en cada barra** mientras hay posición:

```pine
if strategy.position_size > 0
    avg = strategy.position_avg_price
    sld = atr_l * i_sl_l                 // ← atr_l se recalcula cada barra
    strategy.exit("LX", "L", stop=avg - sld, limit=avg + sld * i_rr_l)
```

`avg` es fijo, pero `atr_l` **cambia en cada vela**. El stop y el TP se mueven durante el trade.
Si la volatilidad se expande después de entrar, el stop se **aleja** y la pérdida potencial crece;
si se contrae, se acerca.

Esto contradice directamente la documentación:

> §5.3: *"Las órdenes de salida se colocan inmediatamente al abrir la posición y permanecen activas"*
> §2.3: *"Los stops son fijos basados en ATR"*

No lo son. Lo que se backtesteó es un stop flotante por volatilidad, no el sistema descrito.
Todas las métricas de riesgo (max DD, peor trade, R:R efectivo) corresponden a un sistema
distinto del que dice el informe. **Este es el hallazgo que más invalida los números.**

Efecto secundario: en la barra en que se llena la entrada la posición está **sin protección**,
porque el `strategy.exit` recién se emite al cierre de esa barra.

### 3.2 `slippage=2` es 2 *ticks*, no 2 dólares (impacto alto)

En Pine, `slippage` se expresa en ticks del símbolo. Para `CRYPTO:BTCUSD` con mintick 0.01
eso es **$0.02 por fill** — cero efectivo sobre un activo de ~$60–100k. Ambos informes lo
presentan como realista ("slippage 2 pts", "realistic commissions and slippage").

Son entradas por **ruptura con orden a mercado en la apertura de la vela siguiente**: el
escenario de peor slippage que existe. Un valor realista es 5–20 bps por lado. Sobre 97 trades
con compounding al 100% del equity, corregir esto sólo puede restar, y bastante.

### 3.3 El apalancamiento SÍ se puede simular en TradingView (impacto medio)

Los tres documentos afirman lo contrario y por eso extrapolan a mano:

> *"TradingView no permite simular leverage en instrumentos spot. Los resultados a 2× y 3×
> se calcularon matemáticamente: `equity_new = equity_prev × (1 + leverage × trade_pct/100)`"*

Es incorrecto. `strategy()` acepta `margin_long` y `margin_short`:
`margin_long=50, margin_short=50` con `default_qty_value=200` da 2× **y TradingView modela
los margin calls**. La fórmula manual aplica el leverage al resultado *cerrado* de cada trade
e ignora por completo el recorrido *intra-trade*: nunca puede detectar una liquidación.

Por eso la afirmación *"Riesgo de liquidación a 2×: 0%"* no está demostrada — está asumida
por construcción del método.

### 3.4 Posible repintado del filtro macro (impacto medio, verificable)

```pine
daily_ema = request.security(syminfo.tickerid, "D", ta.ema(close, i_dema))
```

No usa `lookahead_on`, así que **no hay sesgo de futuro** — eso está bien. Pero devuelve la
EMA diaria **en formación**, que cambia durante el día. La versión estrictamente
no-repintante es `ta.ema(close, i_dema)[1]` (última diaria cerrada).

Dado que `macro_bear` es el gatillo del 100% de los cortos, y los cortos son el 32% del P&L
declarado, **hay que medir esta diferencia**. Si los cortos se caen con la versión cerrada,
buena parte del edge era artefacto.

### 3.5 Contradicción entre el sizing del código y el del protocolo

El código: `default_qty_value=100` → 100% del equity por trade.
La recomendación §14.2: *"Nunca arriesgar más del 2% del capital por señal individual."*

Con SL a 2×ATR(10), el riesgo real por trade es ~3–5% del equity a 1× y ~6–10% a 2×.
Entre 3 y 5 veces lo que recomienda el propio documento. Las dos cosas no pueden ser ciertas.

---

## 4. Hallazgos estadísticos

### 4.1 Todo el lado corto depende de 4 trades — y de uno en particular

30 cortos, **4 ganadores** (13.33%), P&L neto +$16,997.
El mejor corto solo: **+$11,906 = 70.0% de toda la ganancia del lado corto.**

Quitando esa única operación, los cortos aportan ~$5,091 en vez de $16,997, y la tesis
central de la auditoría ("los cortos mejoran todos los indicadores") deja de sostenerse.
Un PF de 4.52 calculado sobre 4 observaciones no tiene poder estadístico.

### 4.2 La atribución Long vs Short está mal construida

El audit reporta que los largos rinden **+108.54% en long-only** y **+367.93% en L+S**.
Son las *mismas señales*. La diferencia viene de dos efectos que el documento mezcla:

1. Compounding sobre una base de capital mayor (el documento lo reconoce en §7.2)…
2. …pero además `no_pos` hace que **un corto abierto bloquee entradas largas**, así que
   el conjunto de trades largos es genuinamente distinto entre ambas versiones.

Con esto no se puede descomponer el P&L por lado. Y sin embargo §9.2 reporta
*"CAGR contribución largos: 91.66%/año"* y §10.2 *"cortos: 52.00%/año"* como si fueran
aditivos. No lo son.

### 4.3 Sobreoptimización: los propios datos muestran los acantilados

El documento presenta la sensibilidad como robustez —
*"Parámetros óptimos son robustos: pequeñas variaciones los empeoran"* (§14.1).
Es el argumento al revés. Un parámetro robusto tiene una **meseta** alrededor del óptimo.
Un pico afilado es la firma de curve-fitting. Del propio informe A:

| Cambio | Net P&L | |
|---|---|---|
| SL 1.75 / **2.0** / 2.25 | +61.53% / **+108.38%** / +38.36% | acantilado a ambos lados |
| R:R 2.5 → 3.0 | +108.38% → +44.17% | −59% por un paso |
| ATR 10 → 7 | +108.38% → +25.66% | −76% |
| EMA 150 / **200** / 250 | +35.1% / **+108.38%** / +50.2% | triplica y se vuelve a caer |

Un filtro de tendencia genuino no puede triplicar el rendimiento entre EMA150 y EMA200.

**Y aquí hay una contradicción numérica directa:** el audit §9.3 reporta la *misma prueba*
con otros números — EMA(150) ≈ **+94%**, EMA(250) ≈ **+87%** — una curva mucho más plana.
Los dos documentos no pueden estar ambos en lo correcto sobre el mismo barrido.

Entre A (~15 variantes), B (~50) y C ("40+ variants"), se evaluaron del orden de 100
configuraciones y se eligió el máximo, sobre 60–97 trades. Sin holdout, sin walk-forward,
sin Monte Carlo. El rendimiento del ganador está sesgado al alza por construcción.

### 4.4 El período está mal declarado en el audit

Dic 31 2023 – May 15 2026 = **28.5 meses**. El audit dice "17 meses" en tres lugares
(advertencia inicial, tabla de leverage §11.3, limitaciones §14.3).

No es sólo un typo: cambia el CAGR de **118%** a **270%**. El CAGR reportado (118.40%)
es consistente con 28.5 meses, así que los números están bien y **el texto está mal** —
pero cualquiera que lea "17 meses" y recalcule llegará a otra conclusión.

### 4.5 El test de 10 años no valida la estrategia de 4H

+122,914% en Daily 2016–2026 se presenta como mitigación del overfitting. Pero:

- Es **otro timeframe** y otro filtro macro (EMA semanal): no valida los parámetros de 4H.
- **0 cortos disparados** (bug reconocido): es una estrategia distinta, long-only.
- Max DD **52.84%** — cuatro veces el 12.03% del backtest corto.
- Con 100% de equity compounding desde BTC a $430, es en gran medida buy-and-hold apalancado.

El propio documento C es más honesto: *"the strategy was not profitable in the 2017–2018 cycle."*

---

## 5. Brechas para operar en vivo

| # | Brecha | Detalle |
|---|---|---|
| 1 | **Funding no modelado** | Perp con hold medio 4.5 días. A 0.01–0.03%/8h son 0.135–0.405% por trade. Sobre 97 trades compuestos es material. El informe A lo menciona como nota y no lo incluye. |
| 2 | **Instrumento ≠ backtest** | Se backtestea `CRYPTO:BTCUSD` (índice spot agregado) y se opera un **perp de Coinbase**. Series de precio distintas → señales y fills distintos. |
| 3 | **Disponibilidad del venue** | "Coinbase Advanced, perpetuo BTC, hasta 10×" — el acceso a perps depende de jurisdicción y entidad. Verificar antes de dimensionar nada. |
| 4 | **SL y TP en la misma vela** | Con TP a 2.5R/4R y SL de 1.5–2×ATR, en velas de 4H de BTC ocurre. Hay que reejecutar con **Bar Magnifier** activo para saber cuál se asume primero. |
| 5 | **Sin ejecución ni reconciliación** | No hay puente entre la señal de TradingView y la orden. Esta app (`src/lib/coinbase`, `src/lib/reconstruction`) ya hace la mitad del trabajo. |

---

## 6. Qué haría a continuación, en orden

Ninguna de estas conclusiones descarta la estrategia. Dicen que **los números actuales no
son fiables todavía**. El orden importa: los primeros pasos pueden cambiar todo lo demás.

1. **Decidir cuál es la estrategia vigente.** A, B o C. Archivar las otras dos en
   `trading/archive/` con un README que diga por qué. Hoy el repo afirma tres cosas distintas.
2. **Reejecutar B con los stops congelados** (`strategy_v4.pine`, incluido). Si el max DD del
   12.03% se mueve mucho, todo el perfil de riesgo publicado hay que rehacerlo.
3. **Reejecutar con slippage realista** (10–20 bps) y **Bar Magnifier** activo.
4. **Medir el repintado del filtro diario**: correr con `[1]` y sin `[1]`, comparar el P&L
   de los cortos. Es un toggle en v4.
5. **Simular el leverage de verdad** con `margin_long/short`, no con la fórmula manual.
6. **Walk-forward**: optimizar en Dic 2023–Dic 2024, validar en 2025–2026 sin tocar nada.
   Es la única prueba que responde a la sobreoptimización. v4 trae ventana de fechas.
7. **Reejecutar el barrido de EMA** para resolver la contradicción del §4.3.
8. **Sumar funding** al coste (subir `commission_value` para embeberlo es la vía rápida).
9. Recién entonces: papel/live pequeño, reconciliando contra la app.

## 7. Higiene del repo

- Tres generadores de ~1300 líneas casi idénticos → un generador + archivo de datos + locale.
- Rutas Windows hardcodeadas (`C:\Users\pekas\...`) en los cuatro `.py`.
- 6 PDFs/HTML generados versionados junto a su generador.
- `debug.log` (crash de Chromium) no aporta nada.
- La carpeta está desconectada de la app, que ya tiene estrategias, PnL y reconciliación.
