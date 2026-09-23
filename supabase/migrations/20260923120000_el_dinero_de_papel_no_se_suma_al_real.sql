/*
  Que una operación de papel no pueda sumarse al dinero de verdad.

  Hasta ahora no hacía falta: todo lo que había en `trades` venía de Coinbase o
  de un CSV del histórico de Coinbase, y era dinero real en los dos casos. La
  única excepción eran los datos de demostración del guion de siembra, y ésos
  no conviven con los de nadie.

  Eso se acaba ahora. Va a entrar paper trading de verdad --una cuenta demo de
  un exchange, sincronizada por el mismo camino que Coinbase-- y con ella
  operaciones que son ciertas como conducta y falsas como dinero.

  ## El problema, tal y como está

  `accounts` ya distingue: tiene `is_demo`. Pero esa columna sólo se usa para
  **no** sincronizar y **no** importar (`.eq("is_demo", false)` en el cron, en
  el importador, en la conciliación). El panel no la mira: `applyFilters` en
  `lib/analytics/queries.ts` lleva un solo filtro que no se puede desactivar
  --fuera las huérfanas-- y ninguno sobre el dinero.

  Así que la primera operación de papel que entrara se sumaría al P&L real. Sin
  error y sin aviso, que es la forma en la que un número deja de significar lo
  que dice.

  ## Derivada y no escrita

  `trades.is_paper` la pone un disparador a partir de `accounts.is_demo`. No la
  escribe quien inserta la operación, y es deliberado: las operaciones las
  reescribe `persist_reconstruction` en bloque cada vez que se recalcula, y una
  columna que hay que acordarse de rellenar es una columna que un día sale
  vacía. Es la misma decisión que `paper_accounts.efectivo`, por el mismo
  motivo y después del mismo susto.

  Denormalizada y no un join: toda consulta del panel filtra sobre `trades` en
  plano --`applyFilters` recibe una consulta y le encadena `.eq`-- y meter un
  join a `accounts` en las cuarenta y tantas consultas que lo comparten sería
  cambiar la forma de todas para saber una cosa que cabe en un booleano. Es el
  mismo razonamiento por el que `session_effective` vive en `trades` y no en
  `journal_entries`; está escrito en `docs/DATABASE.md`.

  ## Dos disparadores, porque hay dos formas de que cambie

  Uno en `trades`, para cuando nace o cambia de cuenta. Y otro en `accounts`,
  para cuando una cuenta pasa de demo a real o al revés: sin él, cambiar esa
  casilla dejaría las operaciones viejas marcadas como estaban y la separación
  se rompería en silencio, que es exactamente lo que esto viene a impedir.

  No se llaman entre ellos: el de `trades` sólo salta con `update of
  account_id`, así que la repropagación --que escribe `is_paper` y nada más--
  no lo despierta.

  ## Lo que NO hace

  No esconde nada. La conducta de una operación de papel es real: la hora a la
  que entraste, el setup que dijiste ver, el ánimo con el que llegaste y si te
  saliste de tu propio plan no son menos ciertos porque el dinero fuera
  ficticio -- y son la mitad de lo que esta aplicación existe para enseñar. Lo
  que no se puede es sumar los dos dineros en la misma cifra.

  Por eso la separación es un filtro con un valor por defecto, y el valor por
  defecto es «el real»: cualquier consulta que ya existía sigue devolviendo
  exactamente lo que devolvía antes de que hubiera una sola operación de papel.
  Quien quiera las de papel las pide. Ver `lib/analytics/queries.ts`.
*/

alter table public.trades
  add column if not exists is_paper boolean not null default false;

comment on column public.trades.is_paper is
  'Si el dinero de esta operación era ficticio. La deriva un disparador de accounts.is_demo; escribirla a mano no sirve de nada.';

create or replace function public.trades_marca_el_papel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  /* `coalesce(..., false)` y no dejarlo nulo: la columna es `not null` porque
     «no sé si este dinero era de verdad» no es una respuesta que esta
     aplicación pueda permitirse. Una cuenta que no existe no es de papel. */
  new.is_paper := coalesce(
    (select a.is_demo from public.accounts a where a.id = new.account_id),
    false
  );
  return new;
end;
$$;

comment on function public.trades_marca_el_papel() is
  'Deriva trades.is_paper de accounts.is_demo. Existe para que el saldo de papel no pueda acabar sumado al real por olvidarse de rellenar una columna.';

drop trigger if exists trades_papel_derivado on public.trades;

/* `update of account_id` y no `update` a secas: cada reconstrucción reescribe
   todas las columnas de una operación, y volver a consultar `accounts` en cada
   una sería una consulta por fila para un valor que no ha cambiado. */
create trigger trades_papel_derivado
  before insert or update of account_id on public.trades
  for each row
  execute function public.trades_marca_el_papel();

create or replace function public.cuentas_repropagan_el_papel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_demo is distinct from old.is_demo then
    update public.trades
       set is_paper = new.is_demo
     where account_id = new.id
       and is_paper is distinct from new.is_demo;
  end if;

  return new;
end;
$$;

comment on function public.cuentas_repropagan_el_papel() is
  'Reescribe trades.is_paper cuando una cuenta cambia de demo a real o al revés. Sin esto, cambiar esa casilla dejaría el histórico mal marcado sin decir nada.';

drop trigger if exists accounts_propaga_el_papel on public.accounts;

create trigger accounts_propaga_el_papel
  after update of is_demo on public.accounts
  for each row
  execute function public.cuentas_repropagan_el_papel();

/* Lo que ya estaba escrito. Hoy esto no mueve nada --no hay cuentas demo con
   operaciones-- pero dejarlo sin correr significaría que la columna es cierta
   para lo nuevo y falsa para lo viejo. */
update public.trades t
   set is_paper = a.is_demo
  from public.accounts a
 where a.id = t.account_id
   and t.is_paper is distinct from a.is_demo;

/* Toda consulta de dinero filtra por `is_paper` desde ahora, y las de este
   panel filtran siempre por usuario primero. Parcial sobre lo de papel porque
   es lo que va a ser minoría durante mucho tiempo: un índice sobre una
   columna en la que casi todas las filas valen `false` no descarta nada. */
create index if not exists trades_papel_idx
  on public.trades (user_id, opened_at desc)
  where is_paper;

revoke all on function public.trades_marca_el_papel() from public, anon, authenticated;
revoke all on function public.cuentas_repropagan_el_papel() from public, anon, authenticated;
