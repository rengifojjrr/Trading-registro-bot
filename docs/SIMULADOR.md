# El simulador: bots operando con dinero de mentira sobre precio de verdad

Entre el backtest y la cuenta real falta el paso más aburrido y el que más bots
mata: verlos operar en vivo, sin poner un euro. Un backtest conoce el futuro de
la vela que está evaluando; esto no.

Esta pantalla existe para poder responder a una pregunta concreta: **de todas
estas estrategias, ¿cuál aguanta cuando el precio va llegando de uno en uno?**

## Qué se puede hacer

- Asignar capital ficticio a cada bot, y subírselo o bajárselo cuando quieras.
- Encenderlos y apagarlos de uno en uno.
- Ver a todos operando a la vez, con su equity y su P&L en la misma tabla.
- Entrar en cada estrategia y leer qué hace, con qué reglas y de dónde sale.
- Ver cada operación simulada: cuándo entró, a qué precio, por qué salió.
- En la ficha de cada bot, **el gráfico de velas de su mercado con cada entrada
  y cada salida marcadas** (flecha azul entra, naranja sale) y la posición
  abierta con su P&L latente, su stop y su objetivo. Las velas vienen de la API
  pública, así que el gráfico se dibuja aunque no haya cuenta de Coinbase.

La curva de capital anota **un punto por vela cerrada evaluada**: un bot diario
tarda días en dibujarla. No es que no funcione; es que su reloj es lento. El
gráfico de velas es la forma de ver qué hace mientras tanto.

Todo el dinero es inventado. No hay ninguna orden real en ningún sitio.

## De dónde sale el precio

De la API pública de Coinbase Exchange (`src/lib/coinbase/public-candles.ts`),
que no pide credenciales para datos de mercado.

Se hizo así a propósito y no reutilizando `fetch-trade-candles.ts`: aquélla
exige las claves CDP y que el venue sea FCM, y devuelve `null` sin ellas. Para
el gráfico de una operación real eso está bien —sin conexión con Coinbase
tampoco hay operación que pintar— pero el simulador tiene que funcionar en un
despliegue que todavía no ha conectado ninguna cuenta.

Granularidades disponibles: **1m, 5m, 15m, 1h, 6h, 1d**. El endpoint público
rechaza 30 minutos, 2 horas y 4 horas, así que esas no se ofrecen. Comprobado
contra la API, no supuesto.

## Las tres reglas que impiden que la simulación mienta

**1. Se evalúa la vela cerrada, nunca la que está en curso.** Una señal leída
sobre una vela a medio formar desaparece cuando la vela se cierra distinta. Un
simulador que las lea así se da información que en vivo no tendría, y los
resultados salen inflados. `velasPublicas()` descarta la última vela por eso.

**2. Si en la misma vela se tocan el stop y el objetivo, gana el stop.** Sin
datos de tick no se puede saber cuál llegó primero, y suponer que fue el
objetivo es exactamente el sesgo que convierte un sistema perdedor en uno
ganador sobre el papel.

**3. El deslizamiento va siempre en contra.** Al abrir en largo se paga más
caro; al cerrar, se vende más barato. Se guarda como un número aparte de la
comisión (`paper_settings.deslizamiento_pct`) para que, cuando un bot deje de
funcionar, se pueda distinguir si es él o si se le está cobrando de más.

## Las tablas

| Tabla | Qué guarda |
|---|---|
| `paper_settings` | Comisión, deslizamiento y capital por defecto. Uno por usuario |
| `paper_accounts` | El dinero de cada bot: asignado, libre y equity actual |
| `paper_positions` | Lo que tiene abierto. Como mucho una por bot |
| `paper_trades` | La operación cerrada. **Esto es la trazabilidad** |
| `paper_equity_points` | La curva, un punto por ciclo |

Van aparte de `trades` y no dentro. `trades` son operaciones que ocurrieron de
verdad, reconstruidas desde los fills de Coinbase, y con ellas se mide la
cuenta. Meter dinero inventado ahí obligaría a filtrar «lo que es de mentira» en
cada consulta de la aplicación, y el día que se olvide un filtro el P&L del año
sale mal. Separadas, lo peor que puede pasar es que una pantalla salga vacía.

**Toda cifra que enseñe la ficha de un bot tiene que salir de sumar filas de
`paper_trades`.** Si una cifra no se puede reconstruir desde ahí, la cifra está
mal.

## Cómo se ejecuta

`POST /api/paper/tick` evalúa una vela de cada bot encendido. **Lo dispara un
reloj dentro de la propia base de datos**: un trabajo de `pg_cron` que cada
cinco minutos llama a la ruta con `pg_net`. No hay nada que configurar en
GitHub ni en Vercel para que funcione.

Se llegó aquí por eliminación. Los crons de Vercel en plan gratuito corren una
vez al día. Los de GitHub Actions son de mejor esfuerzo: programado cada cinco
minutos, GitHub lo ejecutó a las 12:30 y a las 16:39 — cuatro horas entre
ciclos — y además exigía dos secretos pegados a mano en su interfaz que nunca
se configuraron, así que el paso del ciclo salió omitido en todas las
ejecuciones. Postgres tiene su propio programador, corre donde ya están los
datos y no espera a ninguna cola ajena.

El reloj se identifica con un secreto que vive en `paper_cron_secret` (una
fila, RLS sin políticas: sólo lo leen el rol de servicio y `postgres`). La ruta
lo acepta además del `CRON_SECRET` del entorno, y lo compara en tiempo
constante. Ver `src/lib/paper/cron-secret.ts`.

El trabajo se crea una vez por entorno, porque lleva la URL del despliegue:

```sql
select cron.schedule(
  'simulador-de-bots-cada-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<tu-despliegue>/api/paper/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select secret from public.paper_cron_secret where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

Para ver si late: `select * from cron.job_run_details order by start_time desc
limit 10;` y la columna `last_tick_at` de `paper_accounts`, que avanza en cada
ciclo.

El workflow de GitHub (`.github/workflows/paper-trading-tick.yml`) sigue en el
repositorio como red de respaldo: si algún día se configuran sus secretos,
correrá también, y el motor es idempotente por vela, así que dos relojes no
abren dos posiciones.

El botón «Correr un ciclo ahora» del simulador sigue ahí para no esperar cinco
minutos cuando se quiere ver algo ya; no hace falta pulsarlo para que los bots
operen.

## Poner la biblioteca a operar

```bash
npm run seed:simulador -- tu@correo.com 10000
```

Crea, por cada estrategia de la biblioteca, sus reglas en
`backtest_strategies`, su bot en `bots` y su cuenta en `paper_accounts` con el
capital indicado.

**Nacen todas apagadas.** Crear la cuenta y ponerla a operar son dos decisiones
distintas, y la segunda es tuya. Es idempotente, y no pisa el capital ni el
interruptor de una cuenta que ya exista: si le pusiste 5.000 a un bot y lo
encendiste, volver a ejecutar el seed no lo deshace.

## En qué fase entra cada bot

**Todos en F1, sin excepción**, tengan backtest o no. No es un descuido: de la
biblioteca al dinero se sube fase a fase, y un bot que apareciera ya en F3
porque su hoja de cálculo era buena se saltaría entera la parte del método que
sirve para algo.

Lo que sí llevan desde el primer día es su evidencia: las cinco estrategias
medidas entran con sus cifras reales en la línea base y en las notas, así que
el semáforo tiene contra qué compararlas en cuanto empiecen a operar. Subirlas
de fase se hace con las puertas, que es donde se comprueba que la muestra
alcanza.

Ninguna lleva contrato de drawdown firmado: el contrato es el percentil 95 del
Monte Carlo, ese Monte Carlo no se ha corrido, y un contrato inventado es peor
que ninguno.

Las cifras medidas están en [BACKTESTS.md](./BACKTESTS.md).

## Lo que esto NO demuestra

Conviene tenerlo claro antes de enseñárselo a nadie:

- **No es dinero real.** No hay libro de órdenes, no hay rechazo, no hay
  latencia. El deslizamiento es un porcentaje fijo, y el real no lo es.
- **No incluye el coste de financiación del perpetuo.** Las cifras son de
  contado. Con posiciones que duran semanas, el *funding* no es un detalle.
- **Unas semanas de papel no validan nada.** El método del que sale este módulo
  pide 30 operaciones limpias antes de dar por buena una recuperación, y los
  bots de swing tardan meses en juntar 30. Un bot que lleva diez días en verde
  lleva diez días en verde, nada más.
- **Las estrategias en F1 no tienen cifras.** Sus reglas están escritas y nadie
  las ha medido. La ficha lo dice explícitamente en vez de enseñar un cero.

## Antes de pasar algo a real

El camino no es «va bien en papel, lo enciendo con dinero». Es el de la cantera
(ver [BOTS.md](./BOTS.md)): fuera de muestra, sensibilidad, Monte Carlo,
contrato de drawdown firmado, staging al 10% del tamaño, y sólo entonces
producción. El simulador cubre la parte de forward testing, que es una fase de
siete, no un atajo que las sustituya.
