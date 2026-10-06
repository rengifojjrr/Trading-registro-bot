-- El recordatorio, en la papelera como todo lo demás.
--
-- Borrar un recordatorio desde la lista lo manda a la papelera y el aviso de
-- «Deshacer» lo devuelve con sus disparos (core_reminder_fires). Al volver, la
-- base recalcula cuándo suena (el disparador de core_reminders), así que no
-- suena lo que ya pasó mientras estaba borrado.
--
-- Va en un archivo aparte porque un valor nuevo de un enum no se puede usar en
-- la misma transacción en la que se añade (como 20261006120100).

alter type public.entity_kind add value if not exists 'RECORDATORIO';
