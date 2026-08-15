-- Cuándo se rotó por última vez la clave de Coinbase.
--
-- La clave en sí nunca vive en la base de datos -- sigue estando sólo en
-- las variables de entorno del servidor, como el resto de secretos de este
-- proyecto. Lo que se guarda aquí es únicamente la fecha, que no es un
-- secreto y no sirve de nada a quien la lea: es lo mínimo necesario para
-- poder avisar de que una clave lleva demasiado tiempo en uso.
--
-- Nullable a propósito: null significa "nunca se registró una rotación",
-- que es distinto de "se rotó hace mucho" y se muestra distinto.
alter table public.app_settings
  add column if not exists coinbase_key_rotated_at timestamptz;

comment on column public.app_settings.coinbase_key_rotated_at is
  'Fecha en que el usuario declaró haber rotado la clave CDP de Coinbase. La clave nunca se almacena aquí.';
