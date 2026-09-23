# Paper trading: seguir llevando el diario sin dinero real

Para cuando no vas a operar tu cuenta de Coinbase pero quieres seguir operando y
seguir guardando los datos, entendiendo que son prácticas.

## Por qué no es TradingView

TradingView es el mejor sitio para *decidir* y el peor para *guardar*. No tiene
API para su panel de paper trading: no existe. Lo que hay son dos cosas, y
ninguna sirve como registro automático:

1. **Exportar el historial a CSV** (panel de paper trading → «Export Data» →
   History). Salen las columnas que hacen falta —símbolo, lado, cantidad,
   precio de ejecución, comisión y hora— y el importador de esta aplicación las
   reconoce casi sin tocar nada. Pero es manual: hay que reexportar cada vez, y
   sólo entran las órdenes en estado *Filled*.

2. **Webhooks de alertas.** Requieren plan Essential o superior **y 2FA
   activado**, sólo puertos 80/443, y TradingView corta la petición a los 3
   segundos. Automáticos, sí, pero **una alerta no es una ejecución**: dice «se
   cumplió mi condición», no «entré a 76.100 con 35 dólares de comisión».
   Registrar alertas como operaciones sería meter ejecuciones inventadas en un
   diario cuyo valor entero es que no miente.

Así que para que las prácticas se guarden **solas** hace falta una cuenta demo
de un exchange que sí tenga API.

## Bybit demo

Tiene API REST de verdad (`api-demo.bybit.com`), con la misma forma que la de
dinero real y saldo ficticio. Eso significa ejecuciones reales con comisiones
reales, sincronizadas por el mismo camino que Coinbase: `raw_fills` → el mismo
motor de reconstrucción → `trades` → el mismo P&L.

Y resuelve solo un problema que TradingView no resuelve: **da igual si pulsas el
botón tú o si la orden la dispara una alerta.** Lo que acaba en la cuenta lo ve
la API igual, así que una sola integración cubre el trading discrecional y el
automático.

### Cómo se pone en marcha

1. Entra en Bybit y cambia a **Demo Trading**. Es un usuario aparte con su
   propio id, y sus claves no valen contra la cuenta real ni al revés: eso es
   precisamente lo que hace que estas credenciales no puedan tocar dinero.
2. Saca una clave de API desde ahí y pon `BYBIT_DEMO_API_KEY`,
   `BYBIT_DEMO_API_SECRET` y `BYBIT_SYMBOLS` (ver `.env.example`).
3. Llama a `/api/bybit/sync-now`. Crea la fila de la cuenta —`venue: EXTERNAL`,
   `is_demo: true`, `connector: BYBIT_DEMO`— y trae lo que haya. Sirve para
   comprobar que las credenciales funcionan antes de confiar en el cron.
4. Enciende `auto_sync_enabled` para que el cron la mire cada ~5 minutos.

### `spot`, no `linear`

`BYBIT_CATEGORY` es `spot` por defecto y es lo recomendado.

En los perpetuos, Bybit cobra *funding*, y ese cobro llega **en la misma lista
que las ejecuciones** (`/v5/execution/list`). El adaptador lo descarta, porque
pasarlo por ejecución inventaría entradas y salidas: un cobro de funding tiene
`execQty` y `execFee` como cualquier fila, y el motor de reconstrucción lo
agruparía como una compra o una venta. La consecuencia es que en `linear` e
`inverse` el P&L de una posición que aguante un cobro **sale mejor de lo que
fue**, por lo que costó el funding.

En `spot` no hay funding y el número es exacto.

## Lo más importante: Bybit demo borra a los 7 días

«Orders generated in demo trading keep 7 days», dice su documentación. Eso
cambia dos cosas.

**Este diario es el único registro durable.** No hay backfill más allá de una
semana, y no hay a quién volver a preguntar.

**Una sincronización caída más de siete días pierde operaciones para siempre.**
No es «se arregla y se recupera el hueco», que es lo que pasa con Coinbase (dos
años de histórico). Es que dejaron de existir.

Por eso el aviso de sincronización caída lleva cuenta atrás cuando habla de esta
cuenta: avisa dos días antes del plazo diciendo cuántos quedan, y cuando el
plazo pasa cambia de tono —«YA SE ESTÁN PERDIENDO OPERACIONES»— y dice la verdad
incómoda, que lo de antes no se recupera arreglándolo. Ver
`src/lib/sync/lo-que-se-pierde.ts`.

Si ese correo llega, no es de los que se dejan para el fin de semana.

Por el mismo motivo el paginador revienta cuando Bybit dice que hay más páginas
y se acabaron los intentos, en vez de devolver lo que tenga: un hueco que no se
vea hoy no se puede arreglar la semana que viene.

## El dinero de papel no se suma al real

`accounts.is_demo` en la cuenta de Bybit es lo que hace que sus operaciones
salgan marcadas con `trades.is_paper`, y las de papel **están fuera de los
totales por defecto**. El filtro «Dinero» del panel tiene tres posiciones:

- **Real** (por defecto): sólo Coinbase y lo importado. Es lo que veías antes de
  conectar nada, y sigue dando exactamente lo mismo.
- **De papel**: sólo las prácticas.
- **Los dos**: para lo que sí se mira junto, que es la conducta. A qué hora
  entras, si te sales de tu propio plan, con qué ánimo llegas y qué setup dices
  ver no son menos ciertos porque el dinero fuera ficticio, y son la mitad de lo
  que este diario existe para enseñar.

En la lista de operaciones, las de papel llevan una insignia «Papel»: si se
piden mezcladas, es lo único que las separa.

Ver `docs/DATABASE.md`, sección «`trades.is_paper`».

## `accounts.connector`

Quién trae los fills de una cuenta, que es otra pregunta que si el dinero es
real. Cuatro valores: `COINBASE`, `BYBIT_DEMO`, `MANUAL` (CSV, Notion o a mano)
y `SEED` (los datos inventados del guion de siembra). Sólo los dos primeros se
consultan.

Existe porque `is_demo` respondía a dos preguntas a la vez y con Bybit dejaron
de tener la misma respuesta: dinero ficticio, sí; nada detrás que consultar, no.

De paso arregló algo que ya estaba mal. El cron elegía cuentas con
`.eq("is_demo", false)` —«todo lo que no sea de demostración»—, y en esta base
eso incluye cuatro cuentas que salieron de importar Notion y CSV. A esas cuatro
les habría pedido los fills **a Coinbase**. No llegó a pasar porque
`auto_sync_enabled` estaba apagado, y el momento en el que habría pasado es
justo encenderlo para sincronizar Bybit.

## Y si prefieres seguir en TradingView

El importador de CSV (`/import`) funciona sin credenciales de Coinbase y produce
*ejecuciones*, no operaciones, así que pasa por el mismo motor y el P&L se
calcula igual. Exporta el historial del panel de paper trading y súbelo a una
cuenta con `connector: MANUAL`. Es manual —unos treinta segundos por sesión— y
no hay nada que se borre a los siete días.
