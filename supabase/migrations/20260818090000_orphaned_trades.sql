-- Operaciones que dejaron de existir en el recálculo más reciente.
--
-- El motor de reconstrucción nunca borra una operación cuyo fill de
-- apertura desaparece (ver docs/RECONCILIATION_RULES.md #4): borrar datos
-- en silencio es justo lo que esta aplicación no debe hacer. Pero hasta
-- ahora esas operaciones tampoco se marcaban, así que se quedaban en la
-- lista como si siguieran siendo reales -- y una posición fantasma
-- "abierta" es peor que ninguna.
--
-- Con esta columna se puede tener las dos cosas: la fila se conserva
-- entera para poder auditarla, y las vistas de posiciones abiertas la
-- excluyen porque ya no describe nada que esté pasando.
--
-- Nullable: null significa "vigente", que es el caso de casi todas.
alter table public.trades
  add column if not exists orphaned_at timestamptz;

comment on column public.trades.orphaned_at is
  'Momento en que el recálculo dejó de producir esta operación. No se borra: se conserva para auditoría y se excluye de las vistas de posiciones vigentes.';

create index if not exists trades_orphaned_idx
  on public.trades (user_id, orphaned_at)
  where orphaned_at is not null;
