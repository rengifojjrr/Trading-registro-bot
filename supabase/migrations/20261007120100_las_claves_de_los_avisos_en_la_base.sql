/*
  Las claves de los avisos al teléfono, también en la base.

  Un push necesita un par de claves VAPID: la pública la conoce el navegador al
  suscribirse y la privada firma cada envío. Hasta hoy sólo se leían de las
  variables de entorno de Vercel (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`), y en la base hay cero suscripciones: ningún teléfono ha
  recibido nunca un aviso. Con los recordatorios eso deja de ser un detalle: un
  recordatorio que no suena es un recordatorio que no existe.

  Si las variables están puestas, mandan ellas (nada cambia). Si no, la
  aplicación genera un par la primera vez que hace falta (al abrir Ajustes →
  Avisos) y lo guarda aquí, con las dos cerraduras de `paper_cron_secret`: RLS
  sin políticas y sin permiso de tabla para `anon` ni `authenticated`. Sólo el
  rol de servicio (la aplicación, en el servidor) la lee.

  La privada no se puede guardar «hasheada»: hace falta entera para firmar. Lo
  que la protege es lo mismo que protege la clave de servicio: no sale del
  servidor.

  Una fila. Cambiar de par deja muertas las suscripciones hechas con el
  anterior (cada teléfono tendría que volver a activarlas), así que nunca se
  rota sola.
*/

create table if not exists public.core_push_keys (
  id integer primary key default 1,
  -- El punto público P-256 sin comprimir (65 bytes) en base64url: lo que pide
  -- el navegador como `applicationServerKey` y el servicio de push en `k=`.
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{86,88}$'),
  -- PKCS#8 en PEM.
  private_key text not null check (private_key like '-----BEGIN PRIVATE KEY-----%'),
  -- mailto: o https:, a quien avisa el servicio de push si algo va mal.
  subject text not null check (subject ~ '^(mailto:|https://)'),
  created_at timestamptz not null default now(),
  constraint core_push_keys_una_fila check (id = 1)
);

alter table public.core_push_keys enable row level security;
revoke all on table public.core_push_keys from anon, authenticated;

drop policy if exists core_push_keys_segundo_factor on public.core_push_keys;
create policy core_push_keys_segundo_factor on public.core_push_keys
  as restrictive
  for all
  to authenticated
  using ((select public.sesion_cumple_mfa()))
  with check ((select public.sesion_cumple_mfa()));

comment on table public.core_push_keys is
  'El par VAPID de los avisos cuando no está en las variables de entorno. Una fila, sin políticas ni permisos: sólo el rol de servicio.';
