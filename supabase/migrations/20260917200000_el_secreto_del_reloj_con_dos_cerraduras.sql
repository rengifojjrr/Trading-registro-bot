/*
  El secreto del reloj estaba detrás de una sola cerradura.

  `paper_cron_secret` guarda la credencial con la que pg_cron se identifica
  ante `/api/paper/tick`. Su migración la protege activando RLS y no
  escribiendo ninguna política: sin política, ni `anon` ni `authenticated`
  pueden leer una fila. Eso es correcto y funciona.

  Lo que hay debajo no: la tabla conserva el `grant all` que Supabase le pone
  por defecto a esos dos roles sobre cualquier tabla nueva de `public`. Con RLS
  encendida da igual --la política que no existe deniega antes--, y por eso no
  se ve. Pero significa que lo único que separa la credencial de la clave
  publicable que está en el navegador es esa línea de `enable row level
  security`. Un `alter table ... disable row level security` escrito para
  depurar algo, un `supabase db reset` contra una versión del esquema sin esa
  línea, una migración futura que la pierda al recrear la tabla: cualquiera de
  esas tres cosas convierte el secreto en público en el mismo instante, sin
  error y sin aviso.

  Dos cerraduras, entonces. Quitado el permiso de tabla, una RLS apagada por
  accidente deja «permission denied for table paper_cron_secret» en vez de la
  fila, que es el fallo que se quiere cuando se falla.

  Quien tiene que leerla la sigue leyendo: `service_role` --con el que la ruta
  comprueba el secreto-- y `postgres` --con el que corre pg_cron-- conservan lo
  suyo, y los dos se saltan las RLS de todas formas.

  No se toca ninguna otra tabla. En las demás el `grant` a `authenticated` es
  justo lo que hace falta para que las políticas tengan algo que filtrar; ésta
  es la única del esquema cuyo contenido no es de nadie que entre por la
  aplicación.
*/

revoke all on table public.paper_cron_secret from anon, authenticated;
