#!/usr/bin/env bash
# Aplica TODAS las migraciones a un Postgres local vacío y corre las pruebas SQL.
#
# Nunca toca la base de verdad: crea (y al final borra) una base de usar y tirar
# en el servidor que le digas. Sirve para comprobar que una migración nueva se
# aplica encima de todas las anteriores y que sus RLS hacen lo que dicen.
#
#   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres bash scripts/probar-migraciones-local.sh
#
# Necesita `psql` de Postgres 15 o más nuevo (las claves foráneas compuestas usan
# `on delete set null (columna)`). Variables: PSQL (ruta a psql), PRUEBA_DB
# (nombre de la base temporal), CONSERVAR=1 (no la borra al acabar).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PSQL="${PSQL:-psql}"
DB="${PRUEBA_DB:-migraciones_prueba}"

export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
ejecuta() { "$PSQL" -X -q -v ON_ERROR_STOP=1 "$@"; }

ejecuta -d postgres -c "drop database if exists \"$DB\"" >/dev/null
ejecuta -d postgres -c "create database \"$DB\"" >/dev/null
ERRORES="$(mktemp)"
limpia() {
  rm -f "$ERRORES"
  if [ "${CONSERVAR:-0}" != "1" ]; then
    "$PSQL" -X -q -d postgres -c "drop database if exists \"$DB\"" >/dev/null 2>&1 || true
  fi
}
trap limpia EXIT

ejecuta -d "$DB" -f "$RAIZ/supabase/tests/bootstrap-local.sql" >/dev/null

n=0
for f in "$RAIZ"/supabase/migrations/*.sql; do
  # pg_cron y pg_net no vienen con un Postgres normal. Ninguna migración los usa
  # al aplicarse (el trabajo del reloj se crea a mano), así que basta con no
  # pedirlos.
  sed -E 's/^create extension if not exists (pg_cron|pg_net)[^;]*;/-- (sin \1 en local)/' "$f" \
    | ejecuta -d "$DB" -f - >/dev/null 2>"$ERRORES" || {
      echo "FALLA al aplicar $(basename "$f"):" >&2
      cat "$ERRORES" >&2
      exit 1
    }
  n=$((n + 1))
done
echo "Aplicadas $n migraciones."

fallos=0
for t in "$RAIZ"/supabase/tests/*.prueba.sql; do
  [ -e "$t" ] || continue
  if ejecuta -d "$DB" -f "$t"; then
    echo "bien  $(basename "$t")"
  else
    echo "MAL   $(basename "$t")" >&2
    fallos=$((fallos + 1))
  fi
done

[ "$fallos" -eq 0 ] || exit 1
