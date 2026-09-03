# El estudio de backtests — agosto de 2026

Doce estrategias clásicas medidas sobre BTC y ETH, en el mismo banco de pruebas
y con las mismas condiciones. Cinco siguen en pie. Siete están en el cementerio.

Este documento existe para responder a tres preguntas: **cuánto han dado en el
histórico**, **cuánto han dado en los últimos cuatro años**, y **si conviene
poner el dinero en BTC o en ETH**.

## Cómo se midió

| | |
|---|---|
| Motor | Strategy Tester de TradingView |
| Mercados | `COINBASE:BTCUSD` y `COINBASE:ETHUSD`, diario |
| Capital inicial | 10.000 USD |
| Tamaño de orden | 100% del capital, sin pirámide |
| Apalancamiento | Ninguno (margen 0/0) |
| Comisión | 0,20% por lado |
| Deslizamiento | 0 |
| Ventana reciente | 30 ago 2022 → 29 ago 2026 (48 meses) |

Tres avisos que cambian cómo hay que leer las cifras:

1. **Son de contado, no del perpetuo.** El perpetuo de Coinbase no cotiza en
   TradingView; está verificado. El coste de financiación del perpetuo no está
   incluido, y con posiciones que duran semanas no es un detalle menor.
2. **El deslizamiento es cero y en la realidad no lo será.** Las cifras son un
   techo, no una previsión.
3. **Ninguna ha pasado Monte Carlo ni forward testing.** Por eso ninguna entra
   en la cantera por encima de F3.

## La tabla que importa

Rentabilidad total, media geométrica mensual y caída máxima. Ordenado por lo que
hicieron en los **últimos cuatro años**, que es el único periodo que se parece
al mercado en el que va a operar el bot.

### Bitcoin

| Estrategia | Histórico | Mensual hist. | Últimos 4 años | **Mensual** | Caída máx. | Ops. | PF |
|---|---|---|---|---|---|---|---|
| Comprar y mantener | — | — | +294,67% | **+2,90%** | 54,30% | 1 | — |
| Faber SMA 10 meses | +41.468,83% | +4,37% | +262,06% | **+2,72%** | 17,72% | 1 | — |
| Double Seven | +87,19% | +0,45% | +106,17% | **+1,52%** | 31,10% | 46 | 2,321 |
| SuperTrend + EMA 21/55 | +1.996% | +2,17% | +73,27% | **+1,15%** | 20,68% | 21 | 1,743 |
| Tortugas S1 | +7.694,80% | +3,14% | +65,76% | **+1,06%** | 28,28% | 39 | 1,234 |
| Tortugas S2 | +7.372,72% | +3,11% | +35,32% | **+0,63%** | 33,47% | 33 | 1,111 |
| AQR Ensemble 1/3/12 | +2.630,52% | +2,37% | +29,67% | **+0,54%** | 44,85% | 35 | 1,460 |
| TSMOM 12 meses | +3.122,00% | +2,49% | +26,18% | **+0,49%** | 60,95% | 16 | 1,923 |
| Golden Cross (control) | +2.140,27% | +2,23% | −42,00% | **−1,12%** | 55,16% | 8 | 0,568 |
| TRB (n=50) | +1.237,57% | +1,86% | −18,67% | **−0,43%** | 58,05% | 50 | 0,869 |
| RSI(2) de Connors | −39,70% | −0,36% | — | — | 102,69% | 90 | 0,755 |
| Larry Williams | −97,48% | −2,58% | — | — | 99,06% | 2.979 | 0,964 |
| IBS | −99,92% | −4,93% | — | — | 99,92% | 1.209 | 0,436 |

### Ethereum

| Estrategia | Histórico | Mensual hist. | Últimos 4 años | **Mensual** | Caída máx. | Ops. | PF |
|---|---|---|---|---|---|---|---|
| **Tortugas S2** | +48.706,80% | +5,15% | **+144,97%** | **+1,88%** | 33,49% | 28 | 1,773 |
| Comprar y mantener | — | — | +61,22% | **+1,00%** | 69,60% | 1 | — |
| Tortugas S1 | +8.727,43% | +3,70% | −1,77% | **−0,04%** | 58,33% | 44 | 0,875 |
| TRB (n=50) | +8.354,64% | +3,67% | −17,41% | **−0,40%** | 68,01% | 51 | 0,894 |
| Double Seven | −33,39% | −0,33% | −21,68% | **−0,51%** | 55,63% | 34 | 0,848 |
| Faber SMA 10 meses | +3.818,69% | +3,02% | −39,40% | **−1,04%** | 55,36% | 4 | 0,432 |
| AQR Ensemble 1/3/12 | +57,40% | +0,37% | −54,23% | **−1,62%** | 69,60% | 39 | 0,648 |
| TSMOM 12 meses | −94,17% | −2,28% | −82,08% | **−3,52%** | 83,69% | 24 | 0,175 |
| Golden Cross (control) | +3.097,13% | +2,85% | — | — | 99,74% | 18 | 1,269 |
| Larry Williams | −94,50% | −2,33% | — | — | 99,33% | 2.684 | 0,989 |

### Cómo leer la columna «Mensual»

Es la **media geométrica**: la tasa mensual constante que, compuesta durante el
periodo, da la rentabilidad total. Sirve para comparar estrategias entre sí.

**No es una renta mensual.** El dinero no llega así. Estas estrategias son de
seguimiento de tendencia: pasan meses planas o perdiendo y ganan casi todo en
unos pocos meses buenos. Un inversor que espere ese +1,88% cada mes se va a
encontrar con seis meses seguidos en rojo y va a apagar el bot justo antes del
mes que lo compensa todo. La columna de caída máxima está al lado por esa razón:
las dos cifras se leen juntas o no se leen.

## La respuesta a «¿BTC o ETH?»

**En BTC, nada bate a comprar y mantener.** El +294,67% de no hacer nada supera a
todas las estrategias del estudio. Lo único que ofrecen a cambio es menos
sufrimiento: el SuperTrend + EMA da un tercio de la rentabilidad con **20,68% de
caída frente al 54,30%** de aguantar el activo. Eso es una propuesta legítima —
menos retorno por mucho menos riesgo — pero no es «ganarle al mercado».

**En ETH sí hay una ganadora clara.** Tortugas S2 da +144,97% frente al +61,22%
de comprar y mantener, y lo hace con **33,49% de caída frente al 69,60%**. Más del
doble de rentabilidad con la mitad de riesgo. Es el único caso del estudio donde
una estrategia gana en las dos dimensiones a la vez.

Y es la que mejor aguanta la prueba de robustez. Se probaron cinco combinaciones
de parámetros alrededor de la elegida:

| Parámetros | Últimos 4 años | Caída máx. | PF |
|---|---|---|---|
| 45/20 | +122,99% | 40,76% | 1,562 |
| 55/15 | +44,55% | 49,78% | 1,121 |
| **55/20** | **+144,97%** | **33,49%** | **1,773** |
| 55/25 | +97,87% | 41,14% | 1,502 |
| 65/20 | +85,49% | 45,98% | 1,449 |

Las cinco son positivas. El óptimo está en una meseta, no en un pico aislado, que
es la diferencia entre una regla robusta y una curva sobreajustada.

## Lo que hay que mirar antes de emocionarse

**El histórico completo miente, y miente mucho.** Tortugas S2 en ETH da
+48.706,80% desde 2016 y +144,97% en los últimos cuatro años. Las dos cifras son
correctas. La primera es irrelevante: describe un mercado que ya no existe.

El desgaste se mide bien partiendo la muestra en agosto de 2022:

| | Antes de ago-2022 | Después | |
|---|---|---|---|
| Tortugas S2 en ETH | PF 2,311 | PF 1,773 | se reduce, sobrevive |
| Tortugas S2 en BTC | PF 2,786 | PF 1,111 | casi agotada |

Misma regla, dos activos, dos destinos distintos. Eso es exactamente lo que hay
que vigilar en vivo.

**El control hizo su trabajo.** El Golden Cross estaba en el estudio para
comprobar que el método sabe detectar una mala estrategia. Dio −42,00% en los
últimos cuatro años. Que el control falle donde las candidatas aguantan es una
buena señal sobre el resto de las cifras.

**Un porcentaje de acierto alto no es una ventaja.** El RSI(2) de Connors acierta
el 66,67% de las veces y pierde el 39,70% del capital. Las perdedoras son mucho
mayores que las ganadoras. Es el recordatorio más útil del estudio.

**El coste mata más estrategias que el mercado.** Larry Williams hace 2.979
operaciones en BTC con un factor de ganancia de 0,964 — casi la rentabilidad
neutra — y acaba perdiendo el 97,48%. No está roto direccionalmente; se lo comen
las comisiones. La misma lógica hunde al IBS (1.209 operaciones, −99,92%).

## Por qué se degradan estas estrategias

El patrón es el mismo en casi todas. Tres causas, por orden de importancia:

**1. Selección sobre la propia muestra.** Muchas de estas reglas nacieron
eligiendo los parámetros que mejor funcionaban en los datos que ya se tenían.
Connors probó umbrales de compra de 0 a 10 y eligió 5 porque daba el mejor
resultado. Dennis y Eckhardt eligieron 55 y 20 en 1983 sin evidencia publicada de
que dominen a 50/20 o 60/25. Larry Williams fija un multiplicador distinto para
cada mercado. Sullivan, Timmermann y White (1999) demostraron que gran parte de
la ventaja de las reglas técnicas clásicas desaparece al corregir por este sesgo.

**2. Los estudios originales son brutos.** Casi ninguno descuenta comisiones,
horquilla ni deslizamiento. Una ventaja de 35 puntos básicos por operación es
real sobre el papel y negativa después de pagar 40 en costes. Cuanto más opera
una estrategia, antes la mata esta aritmética — y por eso las que sobreviven en
esta tabla son todas de baja frecuencia.

**3. Masificación.** Son reglas publicadas en libros superventas y en cientos de
scripts públicos. El flujo que antes cobraba la prima ahora compite por ella.

Qué tienen en común las que aguantan: **operan poco** (21 a 46 operaciones en
cuatro años, no 2.979), **cortan rápido las pérdidas y dejan correr las
ganancias** (factores de ganancia por encima de 1,7 con menos del 50% de
aciertos), y **su ventaja no depende de un parámetro exacto**.

Lo que hay que decirle a alguien que ve el +48.000%: esa cifra es de 2016 y no
va a volver. La cifra con la que hay que decidir es +1,88% mensual con un 33% de
caída máxima, y aun así hay que preguntarse cuánto de eso sobrevive al
deslizamiento real, al coste de financiación del perpetuo y a otros cuatro años
de desgaste.

## En qué fase entra cada una

Según las puertas de la cantera (ver [BOTS.md](./BOTS.md)):

| Fase | Estrategia | Qué le falta |
|---|---|---|
| **F3** | Tortugas S2 — ETH | Monte Carlo. Ya tiene fuera de muestra y sensibilidad. |
| **F2** | Double Seven — BTC | Fuera de muestra propio y sensibilidad. |
| **F2** | SuperTrend + EMA — BTC | Sensibilidad formal y Monte Carlo. |
| **F2** | Tortugas S1 — BTC | Sensibilidad y Monte Carlo. |
| **F2** | Tortugas S2 — BTC | Lo mismo, y con la ventaja casi agotada. |

Ninguna tiene capital asignado ni contrato de drawdown firmado. El contrato es el
percentil 95 del Monte Carlo, y ese Monte Carlo no se ha corrido: un contrato
inventado es peor que ningún contrato.

## Cargar el estudio en la plataforma

```bash
npm run seed:backtests -- tu@correo.com
```

Escribe las cinco candidatas en la cantera y las siete descartadas en el
cementerio con su autopsia. Es idempotente: ejecutarlo dos veces actualiza en vez
de duplicar. Los datos están en `src/lib/bots/backtests-2026.ts`.

## Lo que falta

- **Monte Carlo** sobre las cinco candidatas, para poder firmar el contrato de
  drawdown y abrir la puerta de F3 a F4.
- **Coste de financiación real** del perpetuo de Coinbase INTX. Decide si conviene
  contado a 1× o perpetuo apalancado; con posiciones de semanas puede comerse la
  ventaja entera.
- **Validación en otra plaza** (`BINANCE:BTCUSDT.P`) para descartar que algo
  dependa de la serie de precios de Coinbase.
- **Forward testing en papel**, que es la fase F4 y no se puede saltar.
