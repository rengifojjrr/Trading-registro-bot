-- Un tipo de aviso para las operaciones que se cerraron sin apuntar.
--
-- El diario es la mitad del valor de esta aplicación y era la mitad que se
-- olvidaba: la sincronización cierra la operación sola, en silencio, y si no
-- entras a la ficha ese día ya no vuelves. Meses después tienes el historial
-- financiero entero y ni una nota de por qué entraste -- que es justo lo que
-- una plataforma de trading ya te da y este proyecto existía para superar.
--
-- Va como tipo propio y no como `DISCREPANCY` porque no dice que la aplicación
-- esté mal: los números están bien, lo que falta lo tienes que poner tú. Y en
-- Actividad se filtran por separado, que es lo que hace que un aviso opcional
-- no entierre a los que sí obligan a mirar.
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
    'RISK_LIMIT',
    'JOURNAL_PENDING'
  ));
