-- Un tipo de aviso para los topes diarios.
--
-- `max_daily_loss` y `max_trades_per_day` se podían configurar desde el primer
-- día y no disparaban absolutamente nada. Un límite que no avisa no es un
-- límite: es una nota. Y son justo los dos números que existen para el momento
-- en que peor se piensa -- después de perder, cuando la tentación es seguir
-- operando para recuperarlo.
--
-- Va como tipo propio y no reutilizando `DISCREPANCY` porque no es lo mismo:
-- una discrepancia dice que la aplicación puede estar equivocada, y esto dice
-- que la aplicación está bien y quien se está pasando eres tú. Mezclarlos haría
-- imposible filtrar unos de otros en Actividad.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'SYNC_FAILURE',
    'DISCREPANCY',
    'UNCLASSIFIED_FILL',
    'MISSING_CONTRACT_SPEC',
    'CALC_UNVERIFIED',
    'NOTION_ERROR',
    'RISK_LIMIT'
  ));
