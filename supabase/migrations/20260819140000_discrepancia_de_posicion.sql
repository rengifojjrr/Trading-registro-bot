-- Una discrepancia más: la posición no cuadra con la del broker.
--
-- El motor de reconstrucción cierra una operación cuando la posición
-- acumulada vuelve a cero, y arranca suponiendo que empieza plana. Si falta un
-- fill -- uno que llegó tarde, fuera de la ventana de solapamiento -- la
-- posición queda desplazada y la última operación se queda abierta sin que
-- nada lo diga. Una operación cerrada de verdad que figura abierta no produce
-- ningún error: simplemente deja de contar en las cifras.
--
-- Coinbase sí sabe cuántos contratos hay. Preguntárselo tras cada
-- sincronización convierte ese silencio en una fila con nombre.

alter table public.reconciliation_discrepancies
  drop constraint if exists reconciliation_discrepancies_discrepancy_type_check;

alter table public.reconciliation_discrepancies
  add constraint reconciliation_discrepancies_discrepancy_type_check
  check (discrepancy_type = any (array[
    'MISSING_IN_DB',
    'MISSING_IN_COINBASE',
    'FIELD_MISMATCH',
    'UNCLASSIFIED_FILL',
    'TRADE_BOUNDARY_CHANGED',
    'POSITION_MISMATCH'
  ]));
