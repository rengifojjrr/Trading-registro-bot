/*
  Que el efectivo de una cuenta de papel no pueda mentir, lo escriba quien lo
  escriba.

  `lib/paper/runner.ts` ya no lee la columna: deriva el efectivo del libro en
  cada ciclo (`efectivoSegunLibro`), y con eso el fallo que estuvo semanas
  acuñando dinero no puede repetirse. Pero eso protege a partir del despliegue,
  y el reloj del simulador corre cada cinco minutos contra lo que haya
  desplegado ahora. Entre una cosa y otra hay una ventana en la que el código
  viejo puede volver a dejar una posición abierta con el efectivo sin
  descontar.

  Esto cierra esa ventana desde abajo. Un disparador `before insert or update`
  recalcula `efectivo` con la misma resta que hace el código:

      capital asignado + lo realizado en cerradas - lo que cuesta la abierta

  Da igual qué versión de la aplicación escriba: lo que acaba en la fila es la
  cuenta correcta. Y como el ciclo --viejo o nuevo-- arranca leyendo esa
  columna o derivándola, el siguiente ciclo parte de un efectivo bueno y
  dimensiona bien la posición siguiente, que es donde el fallo hacía daño de
  verdad.

  **No toca `equity`.** El patrimonio incluye la posición abierta valorada al
  último cierre, y ese precio no está en la base: viene de la API pública en
  cada ciclo y se usa y se tira. Un disparador que lo recalculara aquí sólo
  sabría valorarla a lo que costó, y eso sería cambiar un número equivocado por
  otro. Con el efectivo bueno, el primer ciclo que pase deja el patrimonio
  bueno también.

  `security invoker` --el de por defecto-- y no `definer`: quien puede escribir
  en una cuenta puede leer sus operaciones, porque las dos políticas dicen lo
  mismo. No hace falta saltarse nada, y una función que se salta las RLS es una
  que hay que vigilar para siempre.
*/

create or replace function public.paper_efectivo_del_libro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.efectivo := greatest(0, round(
    new.capital_asignado
    + coalesce((
        select sum(t.pnl)
        from public.paper_trades t
        where t.bot_id = new.bot_id
      ), 0)
    - coalesce((
        select sum(p.size * p.precio_entrada)
        from public.paper_positions p
        where p.bot_id = new.bot_id
          and p.status = 'ABIERTA'
      ), 0)
  , 2));

  return new;
end;
$$;

comment on function public.paper_efectivo_del_libro() is
  'Deriva paper_accounts.efectivo del libro de operaciones. Existe para que el saldo no dependa de qué versión de la aplicación lo escriba; ver lib/paper/runner.ts.';

drop trigger if exists paper_accounts_efectivo_derivado on public.paper_accounts;

create trigger paper_accounts_efectivo_derivado
  before insert or update on public.paper_accounts
  for each row
  execute function public.paper_efectivo_del_libro();
