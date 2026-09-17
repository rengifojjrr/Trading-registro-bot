/*
  Las dos funciones de disparador que quedaban sin cerrar.

  `20260917120000` dejó escrita una regla: «toda función de este esquema
  aparece en un revoke que nombra a `public` y a `anon`». Y le escribió a
  `handle_new_user` --un disparador, que nadie puede llamar por la API-- un
  revoke que no hacía falta, precisamente para que la regla no tuviera
  excepciones y se pudiera comprobar sola.

  Quedaban dos fuera:

  - `set_updated_at`, de la primera migración, con dieciocho disparadores
    colgando.
  - `paper_efectivo_del_libro`, de ayer, que es la que deriva el efectivo de
    una cuenta de papel.

  Ninguna de las dos es un agujero. Devuelven `trigger`, y Postgres se niega a
  ejecutar una función así fuera de un disparador --«trigger functions can only
  be called as triggers»--; PostgREST ni siquiera las publica. Lo que se
  arregla no es un riesgo, es la excepción: una regla con dos casos que «no
  cuentan» es una regla que hay que explicar cada vez en vez de comprobarla, y
  al primer descuido el tercer caso que no cuenta sí cuenta.

  El disparador sigue disparando. El permiso de ejecución de una función de
  disparador se comprueba al crear el disparador, no cada vez que salta, y los
  dieciocho de `set_updated_at` ya existen. `handle_new_user` lleva desde
  agosto revocada de `public` con su disparador funcionando, que es la prueba.
*/

revoke all on function public.set_updated_at() from public, anon, authenticated;

revoke all on function public.paper_efectivo_del_libro() from public, anon, authenticated;
