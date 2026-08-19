-- Contenido, con el esquema real del calendario de Notion.
--
-- La tabla original tenía cuatro estados inventados por mí. El calendario de
-- verdad -- «📷 Social Media Content Calendar», que vive en las páginas
-- compartidas y no en las privadas, por eso no lo encontré a la primera --
-- tiene diez, y cada uno nombra un cuello de botella concreto del proceso:
-- falta guion, falta grabar, falta editar, falta miniatura. Un tablero con
-- «pendiente / en curso / hecho» no dice qué falta, que es justo lo que hay
-- que saber para desatascar una pieza.
--
-- Todo lo de aquí es idempotente porque parte ya se aplicó en caliente
-- durante el desarrollo; este archivo existe para que el repositorio vuelva a
-- ser la fuente de verdad del esquema.

alter table public.content_pieces
  -- « resumen» en Notion, con el espacio delante incluido.
  add column if not exists summary text,
  -- CANAL: PEKAS TRADING, PEKAS PLAY, PEKAS, otro.
  add column if not exists channels text[] not null default '{}',
  -- Type: Video o Foto.
  add column if not exists content_type text,
  -- Las tres casillas del proceso.
  add column if not exists has_script boolean not null default false,
  add column if not exists is_edited boolean not null default false,
  add column if not exists has_thumbnail_ab boolean not null default false,
  add column if not exists record_difficulty text,
  add column if not exists record_minutes integer,
  add column if not exists edit_minutes integer,
  -- Tipo de Edicion: Sencilla, Multiples Camaras, Tipo Documental, Gameplay,
  -- Con animaciones.
  add column if not exists edit_styles text[] not null default '{}',
  -- «Notas de edicion»: lo único que el editor escribe y lee.
  add column if not exists edit_notes text,
  add column if not exists video_url text,
  add column if not exists final_url text,
  -- Para no duplicar una pieza al reimportar desde Notion.
  add column if not exists notion_page_id text;

-- Los tiempos se guardan en minutos y no como las etiquetas de Notion
-- («2 Horas», «1 Dia»), por lo mismo que en sueño: de una etiqueta de texto no
-- sale una media. El formulario sigue ofreciendo las mismas opciones, pero lo
-- que se archiva es el número.
--
-- La excepción es la opción real «despues de las 10 deje de contar», que no es
-- una duración sino la ausencia de una. Se guarda su suelo -- 600 minutos --
-- con esta marca, para que las gráficas puedan decir «10 h o más» en lugar de
-- afirmar diez exactas.
alter table public.content_pieces
  add column if not exists edit_time_uncapped boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.content_pieces'::regclass
      and conname = 'content_pieces_record_minutes_check'
  ) then
    alter table public.content_pieces
      add constraint content_pieces_record_minutes_check
      check (record_minutes is null or record_minutes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.content_pieces'::regclass
      and conname = 'content_pieces_edit_minutes_check'
  ) then
    alter table public.content_pieces
      add constraint content_pieces_edit_minutes_check
      check (edit_minutes is null or edit_minutes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.content_pieces'::regclass
      and conname = 'content_pieces_content_type_check'
  ) then
    alter table public.content_pieces
      add constraint content_pieces_content_type_check
      check (content_type is null or content_type in ('VIDEO', 'FOTO'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.content_pieces'::regclass
      and conname = 'content_pieces_record_difficulty_check'
  ) then
    alter table public.content_pieces
      add constraint content_pieces_record_difficulty_check
      check (record_difficulty is null or record_difficulty in ('FACIL', 'MEDIO', 'DIFICIL'));
  end if;
end $$;

-- Los diez estados reales, en el orden del proceso.
alter table public.content_pieces
  drop constraint if exists content_pieces_status_check;

alter table public.content_pieces
  add constraint content_pieces_status_check
  check (status in (
    'IDEA',
    'FALTA_GUION',
    'FALTA_GRABAR',
    'FALTA_EDITAR',
    'EDITANDO',
    'EDITADO_FALTA_LINK',
    'EN_DRIVE',
    'FALTA_MINIATURA',
    'LISTO_PARA_PUBLICAR',
    'PUBLICADO'
  ));

-- Una pieza de Notion es una sola pieza aquí, por muchas veces que se
-- reimporte. Parcial porque lo creado dentro de la aplicación no tiene página
-- de Notion y todos esos nulos no deben chocar entre sí.
create unique index if not exists content_pieces_notion_page_idx
  on public.content_pieces (user_id, notion_page_id)
  where notion_page_id is not null;

create index if not exists content_pieces_planned_idx
  on public.content_pieces (user_id, planned_date);
