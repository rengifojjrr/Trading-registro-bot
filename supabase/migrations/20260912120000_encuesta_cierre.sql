-- La encuesta que sale al cerrar una operación necesita recordar una sola
-- cosa: que ya se abrió para esta operación y se cerró, la contestaras o no.
--
-- No se puede deducir de lo escrito. Si alguien la cierra sin contestar no
-- queda ningún rastro en las columnas del diario, así que sin esta marca
-- volvería a salir en cada visita: exactamente la forma de conseguir que se
-- cierre sin leerla para siempre. Y no distingue «contestada» de «saltada»
-- porque para decidir si volver a abrirla las dos cosas son lo mismo; lo que
-- se contestó ya está en las columnas de al lado.
alter table public.journal_entries
  add column if not exists survey_closed_at timestamptz;

comment on column public.journal_entries.survey_closed_at is
  'Cuándo se cerró la encuesta de esta operación, contestada o no. Null = todavía puede salir sola.';
