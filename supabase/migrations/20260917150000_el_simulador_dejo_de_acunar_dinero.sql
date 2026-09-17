/*
  Reparar las tres cuentas de papel que el fallo del efectivo dejó torcidas.

  El fallo está contado entero en `lib/paper/runner.ts`, en
  `efectivoSegunLibro`. En corto: la posición se escribía vela a vela y el
  efectivo de la cuenta una sola vez al final del ciclo, así que un ciclo que
  muriera entre las dos cosas dejaba la posición abierta y el efectivo sin
  descontar. El ciclo siguiente sumaba las dos y la cuenta valía el doble.

  El código ya no puede repetirlo --el efectivo se deriva del libro y no se
  lee de la columna-- y con eso las cuentas se enderezan solas en el ciclo
  siguiente. Pero hay dos cosas que no se arreglan solas y son las de aquí:
  una posición que se abrió con dinero que no existía, y una curva histórica
  con un escalón que nadie va a poder explicar dentro de seis meses.

  Lo que había:

  | Bot                              | Decía   | Tenía    |
  |----------------------------------|---------|----------|
  | Expansión de rango               | $13.211 |  $5.560  |
  | Barrido de liquidez + envolvente | $11.239 |  $4.716  |
  | Vuelta a la VWAP                 |      $0 |  $4.489  |

  Los dos primeros se inventaron 7.650 y 6.522 dólares. El tercero es el mismo
  fallo por el otro lado: se quedó a cero teniendo 4.489, y a cero un bot no
  puede abrir nada, así que llevaba días muerto sin que lo pareciera.

  Ninguno de los tres se veía como un fallo en la pantalla. Se veían como
  estrategias que ganaban dinero, que es bastante peor que un error visible.
*/

/*
  1. La posición que no se podía pagar.

  «Barrido de liquidez» tiene abierta una de 11.287 dólares con una cuenta de
  4.716. El tamaño salió de un efectivo inflado, así que la posición no es una
  decisión del bot mal ejecutada sino una que no debió poder tomarse.

  Se borra en vez de cerrarse. Cerrarla escribiría una operación en el libro
  --con su resultado, su comisión y su hora-- y el libro es lo único que aquí
  no se toca: es de donde sale todo lo demás. Una posición abierta todavía no
  ha producido ninguna fila en `paper_trades`, así que quitarla no cambia ni
  un número del histórico. El bot volverá a entrar cuando su estrategia le dé
  la señal, ya con el tamaño que de verdad puede pagar.
*/
delete from public.paper_positions
where id = '5824d864-7b9c-4137-8226-bc1a47d0ab97'
  and status = 'ABIERTA';

/*
  2. La curva, rehecha desde el libro.

  Cada punto pasa a ser el capital asignado más lo ganado y perdido en las
  operaciones cerradas hasta esa hora. Es la misma cuenta que hace ahora el
  código, aplicada hacia atrás.

  Queda plana mientras hay una operación abierta, y antes ondulaba. Esa
  ondulación era el valor de la posición vela a vela, y para rehacerla harían
  falta los precios de cada una de esas velas, que no se guardan -- vienen de
  la API pública de Coinbase en cada ciclo y se usan y se tiran. Entre una
  curva plana a trozos y verdadera, y una ondulada con un escalón de seis mil
  dólares en medio, la plana dice más.

  Las **horas** no se tocan, sólo los importes: el punto más reciente es
  también la marca de «hasta aquí evalué», y moverla haría que el simulador
  reevaluara velas viejas e inventara operaciones que no ocurrieron.
*/
update public.paper_equity_points e
set equity = greatest(0, round(
  a.capital_asignado::numeric
  + coalesce((
      select sum(t.pnl)
      from public.paper_trades t
      where t.bot_id = e.bot_id
        and t.hora_salida <= e.ts
    ), 0)
, 2))
from public.paper_accounts a
where a.bot_id = e.bot_id
  and e.bot_id in (
    'c38afa1b-1587-49e9-b980-8a3eeaeb12de',  -- Vuelta a la VWAP
    '621d0d27-c22d-475a-8be9-a3ee132eda2e',  -- Barrido de liquidez + envolvente
    '2de38316-73e4-439f-9763-b435114915da'   -- Expansión de rango
  );

/*
  3. El efectivo y el patrimonio de todas las cuentas.

  De todas y no sólo de las tres: el resto ya cuadraba, así que para ellas
  esto no cambia nada, y escribirlo igual deja las dieciocho saliendo de la
  misma cuenta en vez de unas de una y otras de otra.

  Sin el valor de mercado de la posición abierta, que necesita un precio de
  ahora mismo y aquí no hay ninguno. El primer ciclo que pase lo pone; hasta
  entonces la cuenta vale lo que costó su posición, que es lo que valía
  cuando se abrió.
*/
update public.paper_accounts a
set efectivo = greatest(0, round(
      a.capital_asignado::numeric
      + coalesce((select sum(t.pnl) from public.paper_trades t where t.bot_id = a.bot_id), 0)
      - coalesce((select sum(p.size * p.precio_entrada) from public.paper_positions p
                  where p.bot_id = a.bot_id and p.status = 'ABIERTA'), 0)
    , 2)),
    equity = greatest(0, round(
      a.capital_asignado::numeric
      + coalesce((select sum(t.pnl) from public.paper_trades t where t.bot_id = a.bot_id), 0)
    , 2)),
    updated_at = now();
