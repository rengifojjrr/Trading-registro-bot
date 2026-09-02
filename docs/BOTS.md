# Bots: la cantera, el equipo y lo que los vigila

El módulo de bots (`/bots`, dentro de Trading) sigue el método de portfolio de bots que Ignacio Ayago enseña pestaña a pestaña en **«El poder de la automatización en trading: cómo mis 32 bots ganan dinero las 24 horas»** (YouTube `MTnrsUa1VA4`, canal *Ignacio Ayago | Trading con Bots*, 20 de agosto de 2026, 29:54). Este documento resume qué enseña el vídeo, qué umbrales exactos da, cómo se ha llevado cada pieza a la plataforma, qué queda fuera y con qué vídeos del canal conviene seguir.

La regla que lo resume, en palabras del vídeo: *la diferencia entre esto y una cuenta quemada no son los bots, es el sistema que los vigila*.

## 1. Qué enseña el vídeo

Cinco capas, en el orden en que las abre:

1. **La sala de máquinas.** Un VPS encendido 24/7, cada bot con su *magic number* («la matrícula de un coche») y las operaciones reportadas al panel automáticamente desde MetaTrader; nada se escribe a mano. Encima, un **watchdog**: un pulsómetro que compara las operaciones esperadas de cada bot con las observadas en los últimos 30 días. Por la mañana sólo mira tres números: equity, drawdown y decisiones pendientes. *Diez minutos con el café.*
2. **El equipo.** 32 bots deliberadamente distintos, organizados en tres bloques macro: **convexo** (tendencia y momentum, «pescadores de atún»), **cóncavo** (reversión a la media y grids, «la panadería del barrio») e **híbrido** (order flow e IA, que descorrelacionan). Objetivo **40/40/20**; la foto real del día era 45,7 / 32,6 / 21,7 y se rebalancea *en la revisión mensual, no cuando apetece*. Tamaños: cada bot entre el 3% y el 5% del capital, cada operación entre el 0,3% y el 0,6%; ningún bot puede hundir el barco. Cero posiciones sin stop.
3. **Los sistemas de control** (donde casi todos fallan):
   - **La matriz de correlaciones.** Cinco bots que ganan y pierden los mismos días son cinco hermanos gemelos. Media del portfolio 0,16; un par (dos scalpers en mercados distintos) a **0,52** queda marcado como *par redundante*.
   - **Alpha decay y semáforos.** Toda estrategia pierde su ventaja tarde o temprano; los bots *se apagan poco a poco como una pila*. Cada bot se compara en una ventana móvil contra su línea base (backtest e histórico), como una analítica de sangre. Protocolo escrito en piedra: **verde**, no tocar nada; **amarillo**, tamaño al 50% y vigilar; **naranja**, a *paper trading* hasta demostrar 30 operaciones limpias. Ejemplo real: profit factor rodante 1,18 contra 1,94 de línea base → naranja, «desactivar la apertura de nuevas posiciones y dejar que las existentes cierren por sus reglas».
   - **La escalera kill-switch.** El cuadro de diferenciales de la casa, sobre el drawdown del portfolio: **8%** alerta, **12%** todos los bots a la mitad, **15%** cerrar posiciones, **20%** apagón total. En cinco años y medio esa cuenta no pasó del 4,8%.
   - **Monte Carlo y el contrato de drawdown.** El histórico de cada bot se baraja **300 veces**; el **percentil 95** del drawdown es el contrato que firma antes de operar con dinero. *Si algún día lo supera, no está teniendo mala suerte: está incumpliendo contrato.*
   - VaR diario al 95% y CVaR al 99%, y un **escudo de noticias** a 48 horas para sacar a un bot de una ventana que no le sienta bien.
4. **La fábrica: la cantera y el cementerio.** Siete fases, *de la F1 en papel a la F7 en producción*; nadie debuta por caerle bien al entrenador. Desde la **F4** los ascensos los deciden **puertas automáticas** con métricas fijas: **profit factor > 1,5**, **expectativa > 0,15 R**, **Sharpe > 1**, **drawdown < 20%** y el criterio que casi todos ignoran, **muestra suficiente**: un bot con profit factor 32,75 y nueve operaciones sigue retenido. En F6 (*staging*) se opera con el **10%** del tamaño objetivo. El **cementerio** guarda a los retirados con su autopsia (spread nocturno del broker que se comió una expectativa de 0,19 R, sobreajuste, intervención de un banco central) y una regla de oro: *un bot retirado jamás vuelve sin pasar otra vez por la cantera, especialmente por la fase 3*.
5. **Los retiros y el calendario.** El componente más peligroso del sistema es quien lo vigila: por eso existe el **diario de impulsos**. Cada impulso (apagar, cortar, subir el riesgo) se apunta y a los **7 días** el sistema enseña qué habría pasado: ese trimestre, 654,80 € de *multas que no llegó a pagar*. La pestaña de **auditoría** cierra balance inicial + flujo neto = balance final con discrepancia 0. Y el **calendario de decisiones**: cada domingo 20 minutos técnicos sin mirar la rentabilidad; cada 15 días semáforos y confirmar el 50% de los amarillos; el primer domingo de mes comparar con el backtest, rebalancear si un bloque se desvía más de 10 puntos, revisar correlaciones y **ejecutar el retiro como una línea más del checklist**; cada trimestre robustez, alpha decay e informe de impulsos; en enero, reestructuración.

Su versión mínima, para copiar a escala: tres bots validados, 0,5% por operación, uno tendencial y uno de reversión con la correlación medida, un semáforo contra el backtest, la escalera 8/12/15, revisión dominical de 20 minutos y la decisión de retiro sólo el primer domingo. *No necesita 32 bots, necesita el protocolo.*

## 2. Los umbrales, tal cual

| Pieza | Umbral del método | Dónde vive en la plataforma |
|---|---|---|
| Bloques | 40% convexo / 40% cóncavo / 20% híbrido; rebalancear si un bloque se desvía > 10 puntos | `bot_portfolio_settings.target_*`, `lib/bots/blocks.ts` |
| Tamaño | 3–5% del capital por bot, 0,3–0,6% por operación | `bots.sizing_pct`, `bots.risk_per_trade_pct` (se declaran; no se imponen) |
| Correlación | > 0,5 = par redundante; mínimo de días en común para medirla | `REDUNDANT_CORRELATION = 0.5`, `MIN_DAYS_FOR_CORRELATION = 20`, `lib/bots/correlation.ts` |
| Semáforo | ventana móvil contra línea base; amarillo → 50%, naranja → papel hasta 30 limpias | `lib/bots/semaforo.ts` (`YELLOW_RATIO = 0.85`, `ORANGE_RATIO = 0.6`), ventana de 30 días o 30 operaciones, mínimo 10 |
| Kill-switch | 8 / 12 / 15 / 20 % de drawdown del portfolio | `bot_portfolio_settings.ks_*`, `lib/bots/killswitch.ts` |
| Monte Carlo | 300 barajadas, contrato = percentil 95 | `lib/bots/montecarlo.ts`, `bots.drawdown_contract_pct` |
| Puertas (desde F4) | PF > 1,5 · expectativa > 0,15 R · Sharpe > 1 · DD < 20% · ≥ 30 operaciones | `bot_portfolio_settings.gate_*`, `lib/bots/gates.ts` |
| Staging | 10% del tamaño objetivo | `STAGING_SIZING_FRACTION`, texto de la fase F6 |
| Impulsos | evaluación a los 7 días | `IMPULSE_EVALUATION_DAYS`, `lib/bots/impulses.ts` |
| Calendario | semanal 20 min · quincenal semáforos · mensual portfolio y retiro · trimestral robustez · anual reglas | `lib/bots/calendar.ts` |
| Watchdog | esperadas vs observadas en 30 días | `lib/bots/decisions.ts` (`WATCHDOG_RATIO`, `WATCHDOG_MIN_EXPECTED`) |

Los ratios del semáforo (85% y 60% de la línea base) no los da el vídeo con esa cifra: da el ejemplo 1,18 contra 1,94 (un 61%) como naranja. Son la interpretación más conservadora de ese ejemplo y se pueden cambiar en un solo sitio.

## 3. Cómo se ha llevado a la plataforma

**Lo que ya existía y se reutiliza.** El P&L de un bot es el mismo que el tuyo: sus operaciones son filas de `trades` con `bot_id`, reconstruidas por el mismo motor y valoradas por `computeStats`. Por eso «este bot ganó 300» y «tú ganaste 250» son cifras del mismo tipo. La asignación sobrevive al recálculo porque la reconstrucción sólo toca sus propias columnas.

**Lo nuevo.**

- **Tablas** (`supabase/migrations/20260902100000_bots.sql`): `bots` (familia, bloque, fase, tamaños, hipótesis, línea base en JSON, contrato de drawdown, retiro con motivo), `bot_phase_history` (cada ascenso o descenso con las cifras del momento), `bot_impulses`, `bot_portfolio_settings` (un juego de umbrales por usuario, con los de fábrica del método) y `trades.bot_id`.
- **Lógica pura** (`src/lib/bots/`), toda con tests: `metrics` (expectativa en R con la pérdida media como unidad, Sharpe y Sortino anualizados sobre P&L diario con los días sin operar a cero, drawdown en porcentaje del capital), `gates`, `semaforo`, `killswitch`, `blocks`, `correlation`, `montecarlo` (barajado con semilla, reproducible), `impulses`, `decisions` (lo pendiente, incluido el watchdog) y `calendar`.
- **Consultas y acciones** (`src/lib/bots/queries.ts`, `src/app/(dashboard)/bots/actions.ts`): una sola función `buildPortfolio()` monta la foto entera para que el resumen, el equipo, el riesgo y la portada de Vida lean lo mismo. Las acciones dejan rastro en `bot_phase_history` y en el registro de auditoría.
- **Pantallas**: Resumen (decisiones, semáforos, cantera por fases), Equipo (una fila por bot para ver cuál rinde más), Cantera (cinco columnas y el cementerio), Ficha del bot (semáforo con su analítica, puerta criterio a criterio, curva, Monte Carlo y contrato, fase con historial, línea base, operaciones, impulsos, edición), Riesgo (escalera, bloques, correlaciones, umbrales), Impulsos, Calendario. Y «Asignar al bot» en la barra de selección de la tabla de operaciones.
- **Navegación**: un tercer nivel en la barra lateral. Trading → Bots despliega el submenú de bots con una flecha para volver a Trading (`ModuleSection.children` en `src/core/registry.ts`).

**Decisiones que se apartan del vídeo, y por qué.**

- Desde la F4 las puertas deciden, pero un ascenso con la puerta cerrada **se puede forzar escribiendo el motivo**, y queda apuntado como forzado. La regla es que la decisión se pueda revisar después, no que sea imposible tomarla.
- El **contrato** se evalúa desde la fecha de la firma, no desde siempre: lo que el bot hizo en papel antes de firmar no es incumplimiento.
- La línea base puede venir del backtest (escrita a mano en la ficha), del propio histórico (un botón la toma cuando hay diez operaciones) o de nada: sin línea base, el semáforo compara la ventana con el histórico anterior a la ventana, y con menos de diez operaciones no se pronuncia.
- Los ratios son invariantes a la escala y no necesitan el tamaño de la cuenta; sólo el drawdown en porcentaje lo necesita (`app_settings.account_size`). Sin él, la escalera y el criterio de drawdown de la puerta dicen «sin medir» en vez de inventarse una base.

**Lo que queda fuera, a propósito.**

- La **alimentación automática desde MetaTrader** (magic number → operaciones). Aquí las operaciones llegan de Coinbase por la sincronización, o de un CSV o de Notion, y se asignan al bot desde la tabla. El campo `magic_number` se guarda para reconocerlas, no para importarlas.
- **VaR/CVaR diario** y el **escudo de noticias**. Ni uno ni otro cambia una decisión del método sin el resto de la infraestructura del vídeo.
- La **auditoría** ya existe en la plataforma con otro nombre: la conciliación contra Coinbase (`/reconciliation`) es exactamente «lo que ves en el panel es lo que pasó en el broker».
- Los **retiros** se apuntan como una línea del checklist mensual; la plataforma no mueve dinero.

## 4. Cómo alimentarlo

1. En Configuración, pon el **tamaño de la cuenta**: sin él no hay drawdown en porcentaje y la escalera no se activa.
2. Da de alta cada bot en `/bots/nuevo` con su **hipótesis en una frase**, familia, bloque, mercado, temporalidad y fase de entrada (un prototipo entra por F1; un bot que ya corre con dinero, por F6 o F7). Si viene de un backtest, escribe su línea base.
3. **Asigna sus operaciones**: en `/trades`, marca las suyas y pulsa «Asignar al bot». Es el punto tres de la revisión técnica del domingo.
4. Cuando tenga diez operaciones aparece el Monte Carlo; **firma el contrato** al percentil 95 antes de darle tamaño completo.
5. Sube de fase cuando la **puerta** diga GO. Desde F4 la puerta decide; si la fuerzas, escribe por qué.
6. Cada vez que te pique intervenir, **apunta el impulso** y espera siete días.
7. El domingo, la revisión que toque según el **calendario**. Fuera de ese día, no se toca nada.

## 5. Vídeos del canal que ayudan

El canal publica varios vídeos por semana; se han recorrido las listas de recientes y de más vistos (unos noventa títulos). Los que tocan directamente cada pieza de este módulo, por título y descripción:

**Para el propio panel de bots**

- `MTnrsUa1VA4` — El poder de la automatización en trading: cómo mis 32 bots ganan dinero las 24 horas. *El vídeo de este documento.*
- `o3FkmSzIEFw` — Tu Bot IA de Trading se Auto-Pausa Cuando Falla | Aquí está el Código. *El semáforo automático llevado al propio bot: cuándo pausarse solo.*
- `ccypXjJnb_8` — ¿Tu Bot Funciona o Solo Tienes Suerte?: El Test de Robustez. *Las fases F2–F3 de la cantera.*
- `tVyh09Ei0Pw` — La Detección de Régimen que Salva tu Cuenta de Trading. *El motivo de retiro «cambio de régimen».*
- `O3qH8Dq2_kA` — El secreto detrás de los bots profesionales: gestión de riesgo adaptativa. *Tamaños por bot y escalera.*
- `JmtvLLhmp9g` — Gestión de riesgos: el único manual que necesitas para no quemar tu cuenta. *El 3–5% por bot y el 0,3–0,6% por operación.*
- `ALrVPTetelA` — Stop Loss fijo vs CVaR. *Lo que se ha dejado fuera (VaR/CVaR), por si se quiere añadir.*
- `oV8zvE_BpQc` — Tu cuenta está en riesgo: por qué tus datos de trading te engañan. *La auditoría de datos.*

**Para no llenar el cementerio**

- `Vgmo3mxDOmM` — ¿Tu EA gana en backtest pero quiebra en real? Esto es lo que falta.
- `24ywEOM90_c` — Gané millones en backtest pero perdí todo en real | Esto es lo que pasó.
- `eE_dctMBCKk` — Por qué tus bots no ganan dinero aunque el backtest se vea perfecto.
- `52m3zzCH6tg` — 98% de ganancias… luego ruina en 4 horas | El defecto oculto de los bots. *Grids y martingalas: por qué el bloque cóncavo necesita la escalera.*
- `EQQZDHezVRk` — ¿Tu Grid Bot es una bomba de tiempo?

**Para construir los bots (la cantera desde F1)**

- `iZltdEbDzQs` — Curso gratis de trading algorítmico desde cero (12 horas).
- `6YGJ7BmvNBw` — De perder dinero en el trading manual al trading sistemático rentable: el método completo en 5 fases.
- `pmRwQqsuzaM` — Los 6 componentes de un bot rentable.
- `sw6mb7uxTKg` — Guía completa de 0 a 100: cómo diseñar un bot de trading rentable.
- `spDENQO713E` — El secreto detrás de 2.500 pruebas: mi sistema de trading revelado.
- `cPWm-xFakGY` — La IA puso a prueba más de 12.000 estrategias de trading.
- `07ZWOcV1tAI` — 100 estrategias de trading según el régimen de mercado.
- `v_i7QIqu5Sg` — Grid Trading Profesional: las fórmulas exactas. *Bloque cóncavo.*
- `dziH7vU0uGw` — Exponente de Hurst y `l7OnqAcyD04` — Shannon Entropy. *Filtros de régimen para los bots.*
- `TcBSAcDc_vU` — La única estrategia de scalping que necesitas para el BTC; `SNzz9u51MAU` — Scalping de alta precisión con momentum; `qoQfPwJP4sA` — Scalping de 1 minuto. *Candidatos para la cantera en el propio mercado de la plataforma.*
- `JHFD8D67VLw`, `aDp9jRZAJx8`, `3vo9NI6yMjY` — Tier lists de indicadores. *Ideas para el módulo de backtest.*
- `htA4TKGW9qE`, `aMBuSwIKthk`, `dwooYvl7OdA`, `QhfoF6EQj9I` — Bots que se adaptan o aprenden solos. *Bloque híbrido.*

**Infraestructura**

- `y11NHNmi3N8` — MT5 desde cero; `YXwgsPhW7mU` — Tu primer bot de trading con IA en MetaTrader; `pACaX1dtzU0` — VPS barato = dinero quemado.

Sólo el primero se ha transcrito y analizado entero; el resto se cita por título y descripción, como mapa de por dónde seguir.
