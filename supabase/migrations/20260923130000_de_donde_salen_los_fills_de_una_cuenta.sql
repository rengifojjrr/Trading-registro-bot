/*
  De dónde salen los fills de una cuenta, dicho aparte de si el dinero es real.

  `is_demo` respondía a dos preguntas a la vez, y hasta ahora daba igual porque
  las dos tenían la misma respuesta:

  1. ¿El dinero de esta cuenta es ficticio?
  2. ¿Hay que dejarla en paz, porque detrás no hay ninguna API que consultar?

  Eran lo mismo mientras la única cuenta de dinero ficticio era la del guion de
  siembra, cuyas operaciones están inventadas y no hay nada que sincronizar. Con
  una cuenta demo de Bybit deja de serlo: el dinero es ficticio --pregunta 1,
  sí-- y detrás hay una API de verdad con ejecuciones de verdad --pregunta 2,
  no--. Las dos respuestas se separan.

  `is_demo` se queda con la primera, que es la que de verdad le corresponde y la
  que `trades.is_paper` deriva. `connector` responde la segunda.

  ## Y de paso arregla algo que ya estaba mal

  El cron de sincronización elige cuentas así:

      .eq("is_active", true).eq("is_demo", false)

  «Todo lo que no sea de demostración», que en esta base son cinco cuentas: la
  de Coinbase y cuatro que salieron de importar Notion y CSV. Esas cuatro no
  tienen `sync_state` y no tienen nada detrás, y el cron las habría sincronizado
  **contra Coinbase** -- pidiéndole a Coinbase los fills de una cuenta que no es
  de Coinbase y guardándolos ahí.

  No ha pasado nunca porque `auto_sync_enabled` está en `false` y el cron no
  toca ninguna. Pero lo primero que hace falta para sincronizar Bybit es
  encenderlo, y ése es exactamente el momento en el que habría pasado.

  Con `connector`, qué se consulta se dice y no se deduce de lo que algo no es.

  ## Los cuatro valores

  - `COINBASE`: la sincroniza el adaptador de Coinbase. Es la cuenta con
    `venue` FCM o INTX y credenciales de Coinbase detrás.
  - `BYBIT_DEMO`: la sincroniza el adaptador de Bybit contra
    `api-demo.bybit.com`. Dinero ficticio, ejecuciones reales.
  - `MANUAL`: lo que entró por CSV, por el importador de Notion o a mano. No se
    consulta: no hay a quién preguntar.
  - `SEED`: los datos del guion de siembra. Tampoco se consulta, y además sus
    operaciones están inventadas.

  El valor por defecto es `MANUAL`, que es el que no hace nada. Una cuenta nueva
  que nadie clasifique se queda quieta en vez de acabar consultando a un venue
  que no es el suyo, que es el fallo que esto viene a cerrar.

  ## El relleno mira `is_demo` antes que `venue`

  El guion de siembra crea su cuenta con `venue: "FCM"` **e** `is_demo: true`
  (ver `scripts/seed-demo-data.ts`). Clasificar por `venue` primero la dejaría
  como `COINBASE` y el cron se pondría a pedirle a Coinbase los fills de unos
  datos inventados. Las condiciones de abajo son excluyentes a propósito, así
  que el orden en el que se ejecuten da igual.
*/

alter table public.accounts
  add column if not exists connector text not null default 'MANUAL';

alter table public.accounts
  drop constraint if exists accounts_connector_check;

alter table public.accounts
  add constraint accounts_connector_check
  check (connector in ('COINBASE', 'BYBIT_DEMO', 'MANUAL', 'SEED'));

comment on column public.accounts.connector is
  'Quién trae los fills de esta cuenta, que es otra pregunta que si el dinero es real (eso es is_demo). Sólo COINBASE y BYBIT_DEMO se consultan; MANUAL y SEED no tienen a quién preguntar.';

/* Inventadas: ni se consultan ni se creen. Primero, porque llevan venue FCM. */
update public.accounts
   set connector = 'SEED'
 where is_demo;

/* Dinero real con Coinbase detrás. */
update public.accounts
   set connector = 'COINBASE'
 where not is_demo
   and venue in ('FCM', 'INTX');

/* El resto se queda en MANUAL, que es el valor por defecto de la columna. */
