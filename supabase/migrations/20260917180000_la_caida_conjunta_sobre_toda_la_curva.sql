/*
  La «caída máxima» del simulador medía dos días y decía que medía todo.

  La pantalla leía los puntos de curva con `order by ts desc limit 5000` y
  calculaba la caída conjunta sobre lo que llegara. El tope tenía su razón --un
  bot de un minuto deja 1.440 puntos al día y sin límite esa consulta crece
  para siempre--, pero cortar por filas no acota el peso: acota el **periodo**,
  y lo acota cada vez más según se añaden bots. Con dieciocho bots, cinco mil
  filas eran las últimas cuarenta y ocho horas de una historia de dos semanas.

  El resultado era un número que parecía tranquilizador y no lo era: la
  pantalla enseñaba «caída máxima 0,8%» al lado de «P&L del conjunto -7,2%».
  Las dos cifras no podían ser ciertas a la vez, porque una curva que sólo ha
  bajado desde su máximo ha caído por lo menos lo que ha perdido. Medido sobre
  toda la historia, el pico fue 180.558,86 y el valle 154.818,16: **14,26%**.
  Casi dieciocho veces lo que decía.

  Se arregla midiendo donde están los datos. La función recorre la curva entera
  y devuelve una fila; la pantalla deja de traerse cinco mil filas por cada
  visita para sacar un número de ellas.

  ## Cómo se suman curvas que no comparten instantes

  Los puntos de cada bot caen en las horas de SU vela: uno diario deja uno al
  día y uno de quince minutos noventa y seis. Sumar sólo lo que coincide daría
  una curva que se desploma cada vez que un bot no tiene punto ahí, así que
  cada bot arrastra su último valor conocido hacia adelante y su primero hacia
  atrás -- un bot que se enciende hoy no puede aparecer como un salto de
  patrimonio de la nada.

  Rellenar eso con una rejilla de instantes por bots son nueve millones de
  celdas para una respuesta de una línea. No hace falta: entre dos puntos de un
  bot su aportación no cambia, así que el total sólo se mueve cuando algún bot
  tiene punto, y se mueve exactamente la diferencia con su punto anterior. La
  curva conjunta es entonces «la suma de los primeros valores» más la suma
  acumulada de esas diferencias. Una pasada ordenada por (bot, ts), que es
  justo el índice que ya existe.

  Las dos formas se comprobaron contra la base con los datos reales y dan lo
  mismo hasta el céntimo (14,26% / 154.818,16 / 180.558,86). La de la rejilla
  tardaba lo suyo; ésta son 156 ms sobre 35.787 puntos y sin tocar disco.

  La tabla se nombra directamente en vez de pasar por un CTE intermedio, y no
  es cosmético: un CTE al que se apunta tres veces lo materializa Postgres, y
  con eso se pierde el orden del índice y las dos ventanas acaban ordenando en
  disco. Nombrándola, las dos usan `paper_equity_points_bot_ts_idx`.

  Crece con la historia: unos 4,4 µs por punto, y el ciclo deja ~5.000 al día
  con dieciocho bots encendidos. Si algún día esto tarda, lo que hay que mirar
  es podar la curva vieja o guardar la conjunta ya sumada, no volver a recortar
  por filas -- que es el fallo que se arregla aquí.

  ## Permisos

  `security invoker` --el de por defecto-- y no `definer`: la función no lee
  nada que quien la llama no pueda leer ya, así que no hay motivo para saltarse
  las RLS. Sin `user_id` por parámetro tampoco hay forma de pedir la curva de
  otro: se suma lo que la política deja ver, que es la del que llama.
*/

create or replace function public.paper_caida_maxima_conjunta()
returns table (
  caida_pct numeric,
  pico numeric,
  pico_ts timestamptz,
  valle numeric,
  valle_ts timestamptz
)
language sql
stable
set search_path = public
as $$
  -- Lo que cambia el total en cada punto: la diferencia con el punto anterior
  -- de ese mismo bot. El primero de cada bot no cambia nada porque su valor ya
  -- está en la base.
  with diferencias as (
    select ts, equity - lag(equity) over (partition by bot_id order by ts) as delta
    from public.paper_equity_points
  ),
  base as (
    select coalesce(sum(primero), 0) as valor
    from (
      select distinct on (bot_id) equity as primero
      from public.paper_equity_points
      order by bot_id, ts
    ) primeros
  ),
  curva as (
    -- `range` y no `rows`: dos bots con punto a la misma hora son un solo
    -- escalón, y acumular fila a fila inventaría un valor intermedio que la
    -- cartera nunca tuvo. Con `range` todas las filas de un instante comparten
    -- el acumulado, y el `distinct` las deja en una.
    select distinct ts,
           (select valor from base)
             + sum(coalesce(delta, 0)) over (order by ts range between unbounded preceding and current row) as total
    from diferencias
  ),
  con_pico as (
    select ts, total,
           max(total) over (order by ts rows between unbounded preceding and current row) as pico
    from curva
  ),
  caidas as (
    select ts as valle_ts, total as valle, pico,
           case when pico > 0 then (pico - total) / pico * 100 else 0 end as caida
    from con_pico
  ),
  peor as (
    -- Empate a la más antigua: si la curva volvió a tocar el mismo fondo, la
    -- primera vez es la que cuenta como el episodio.
    select * from caidas order by caida desc, valle_ts limit 1
  )
  select round(peor.caida, 2),
         round(peor.pico, 2),
         -- Cuándo se tocó ese máximo: el primer instante que llegó a él antes
         -- del fondo. `pico` es el máximo corriente hasta el valle, así que
         -- ningún punto anterior lo supera y el `>=` sólo puede casar con él.
         (select min(c.ts) from curva c where c.total >= peor.pico and c.ts <= peor.valle_ts),
         round(peor.valle, 2),
         peor.valle_ts
  from peor
  -- Con un solo instante no hay caída que medir, hay una foto. Devolver cero
  -- filas es lo que deja que la pantalla diga «falta curva» en vez de «0,0%»,
  -- que suena a que ya se ha comprobado y va bien.
  where (select count(*) from curva) > 1;
$$;

comment on function public.paper_caida_maxima_conjunta() is
  'Mayor caída desde máximo de la curva de todos los bots de papel sumados, sobre toda la historia. Devuelve una fila (o ninguna si no hay curva). Ver bots/simulador/page.tsx.';

/*
  `public` **y** `anon`, que es la lección de 20260917120000 y se vuelve a
  aprender aquí.

  Escrito primero como `revoke ... from anon`, y `anon` seguía pudiendo
  llamarla: toda función nace además con el permiso implícito de PUBLIC, y
  quitarle el nominal no toca ése. Que sea `security invoker` la salva de ser
  una fuga --sin sesión, las RLS no dejan ver ni un punto de curva--, pero
  recorrer treinta y cinco mil filas es trabajo que nadie sin entrar tiene por
  qué poder pedir.

  Los dos nombres, entonces, y el `grant` explícito de lo único que sí hace
  falta.
*/
revoke all on function public.paper_caida_maxima_conjunta() from public, anon;
grant execute on function public.paper_caida_maxima_conjunta() to authenticated;
