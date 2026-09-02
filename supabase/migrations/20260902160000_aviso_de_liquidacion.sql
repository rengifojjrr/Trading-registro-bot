-- Un tipo de aviso para las liquidaciones de Coinbase.
--
-- Cuando el margen no alcanza, Coinbase cierra posición por su cuenta con una
-- orden de tipo LIQUIDATION. Sus fills llegan como los de cualquier otra orden
-- y la reconstrucción los aplica bien; lo que faltaba era decirlo. Una
-- posición que baja de 78 a 50 contratos sin que hayas tocado nada parece un
-- fallo de sincronización, y no lo es -- y no distinguir las dos cosas es lo
-- que hace que se deje de creer en las cifras.
--
-- Va como tipo propio y no como DISCREPANCY por lo mismo que RISK_LIMIT y
-- JOURNAL_PENDING: no dice que la aplicación esté mal. Es un hecho del
-- mercado que hay que saber, y en Actividad tiene que poder filtrarse aparte.
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
    'JOURNAL_PENDING',
    'LIQUIDATION'
  ));
