-- Estrategias y etiquetas, a la papelera.
--
-- La papelera existe y funciona desde hace tiempo, con siete módulos de vida y
-- las operaciones dentro. Estas dos se quedaron fuera y borraban de verdad:
-- una estrategia con cuarenta operaciones asociadas desaparecía sin más, y con
-- ella la única forma de saber qué tenían en común esas cuarenta.
--
-- Las vistas guardadas se quedan fuera a propósito. Son una configuración de
-- filtros, no un dato: rehacerla cuesta veinte segundos y meterla en la
-- papelera llenaría de ruido la pantalla donde se busca lo que de verdad se
-- perdió.

alter type public.entity_kind add value if not exists 'ESTRATEGIA';
alter type public.entity_kind add value if not exists 'ETIQUETA';
