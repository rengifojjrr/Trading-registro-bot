/*
  Tres funciones `security definer` se podían llamar sin haber entrado.

  Las tres ya traían su `revoke all ... from public`, y las tres seguían
  abiertas a `anon`. No es que el revoke estuviera mal escrito: es que no
  revoca lo que uno cree.

  `revoke ... from public` quita el permiso implícito que Postgres le da a
  PUBLIC. Pero Supabase, sobre el esquema `public`, tiene puesto un
  `alter default privileges ... grant execute on functions to anon,
  authenticated`, así que cada función nueva nace además con **dos permisos
  explícitos** a nombre de esos dos roles. Quitarle el de PUBLIC no toca
  ninguno de los dos, y el resultado es una función que parece cerrada en la
  migración y está abierta en la base.

  Por qué importa: `security definer` significa que la función corre con los
  permisos de quien la creó y se salta las RLS de las tablas que toca. Las tres
  reciben el `user_id` como parámetro. Cualquiera con la clave publicable --que
  está en el navegador, porque para eso es publicable-- podía llamarlas por
  `/rest/v1/rpc/...` con el id de otro y sin sesión ninguna:

  - `persist_reconstruction` reescribe las operaciones de una cuenta entera.
  - `refresh_trade_liquidations` rehace las liquidaciones de un producto.
  - `assign_trades_to_bot` mueve operaciones de bot.

  Lo que se revoca aquí es a quién no le hace falta, que se sabe mirando quién
  las llama:

  - Las dos primeras sólo se llaman desde `lib/reconstruction/persist.ts` con
    el cliente de servicio (`createAdminClient`), así que ni el anónimo ni el
    autenticado las necesitan.
  - `assign_trades_to_bot` sí se llama con la sesión del usuario, desde
    `bots/actions.ts`, así que `authenticated` se queda. Lo que se le quita es
    el anónimo, que no tiene nada que hacer ahí. Su propio cuerpo ya filtra por
    `auth.uid()`, pero un filtro dentro de una función que no deberías poder
    llamar es una segunda cerradura, no la primera.

  `handle_new_user` no aparece: es un disparador y ya estaba cerrada a los dos.
*/

revoke all on function public.persist_reconstruction(uuid, uuid, text, text[], jsonb)
  from anon, authenticated;

revoke all on function public.refresh_trade_liquidations(uuid, text)
  from anon, authenticated;

revoke all on function public.assign_trades_to_bot(uuid[], uuid)
  from anon;

/*
  Y ésta, que ya estaba cerrada, se dice igualmente.

  `handle_new_user` es un disparador: nunca la llamó nadie por la API y el
  `revoke ... from public` de su migración le bastó. Escribirlo de todas formas
  es lo que deja que la regla no tenga excepciones -- «toda función
  `security definer` de este esquema aparece en un revoke que nombra a `anon`»
  --, y una regla sin excepciones es la que se puede comprobar sola. La
  comprueba `supabase/permisos.test.ts`.
*/
revoke all on function public.handle_new_user()
  from anon, authenticated;

/*
  Y que las que vengan detrás nazcan cerradas.

  Sin esto, la próxima función `security definer` que se cree en este esquema
  vuelve a nacer con el permiso puesto y el siguiente que mire los avisos
  encuentra lo mismo. Se apaga el permiso por defecto para funciones nuevas;
  las que de verdad quieran ser públicas lo dirán con un `grant` explícito,
  que es como debía ser desde el principio.
*/
alter default privileges in schema public revoke execute on functions from anon;
