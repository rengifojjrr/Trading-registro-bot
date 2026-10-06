# Proyectos de verdad (E1)

Un proyecto deja de ser sólo un nombre bajo el que colgar tareas. Ahora tiene:

- **estado** (idea, en marcha, esperando, atascado, en pausa, terminado, descartado) y **semáforo** con su porqué;
- **cómo va** en una frase, con fecha y quién la escribió;
- **objetivo**, fechas de inicio y meta, otros nombres (alias) y un `slug`;
- **personas** (`core_people`) y su **papel** en cada proyecto: de qué lado está y qué hace;
- **frentes** (los temas en que se parte el trabajo, con responsable);
- **hoja de ruta**: etapas y, dentro, hitos con fecha y estado;
- **tareas** con responsable (tú, otra persona o sin asignar), frente, hito, subtareas y **de dónde salieron**;
- **bitácora**, **ficha técnica** (Markdown con versiones) y **fuentes** (hoy, documentos y enlaces).

Las pantallas: `/tareas/proyectos` (lista con semáforo), `/tareas/proyectos/[id]` (Resumen, Tareas por persona,
Personas, Hoja de ruta, Ficha, Bitácora, Fuentes), `/tareas/hitos/[id]`, `/personas` y `/personas/[id]`, y
`/tareas/proyectos/importar`. En el móvil, la barra de abajo es Hoy · Proyectos · Tareas · Trading · Buscar.

## Base de datos

Cinco migraciones, **sólo aditivas** (ni un `drop` ni un `update` de filas que existen):

| Migración | Qué hace |
|---|---|
| `20261006120000_proyectos_de_verdad.sql` | Columnas nuevas en `tasks_projects` y `tasks_items`; tablas `core_people`, `tasks_project_members`, `tasks_streams`, `tasks_milestones`, `tasks_project_log`, `tasks_project_docs`, `tasks_project_doc_versions`, `tasks_project_sources`; RLS `(select auth.uid()) = user_id` en todas; disparadores de `version` y de versiones de la ficha |
| `20261006120100_la_persona_tiene_ficha.sql` | `entity_kind` gana `PERSONA` (comentarios, ficheros, vínculos y papelera para personas) |
| `20261006130000_el_segundo_factor_tambien_en_la_base.sql` | `sesion_cumple_mfa()` y una política **restrictiva** en cada tabla de `public` con RLS y en `storage.objects`: con un factor verificado, un token `aal1` no ve ni escribe nada por la API de Supabase (no sólo por la app). `assign_trades_to_bot` hace la misma comprobación |
| `20261006130100_los_nombres_de_antes.sql` | `former_titles` en `tasks_items` y `tasks_milestones`: el título de antes al renombrar, para que el archivo de Claude no duplique |
| `20261006130200_la_tarea_en_un_proyecto_suyo.sql` | Clave compuesta `(project_id, user_id)` en `tasks_items` (además de la de siempre, `not valid`): una tarea sólo cuelga de un proyecto de su dueño |

### Orden para subir a producción

La migración nueva es segura con la app vieja (sólo añade), pero **la app nueva no lo es sin las migraciones**: la
lista de proyectos, la página del proyecto, Personas y los hitos leen columnas y tablas que no existen hasta
aplicarlas. Por eso, en este orden:

1. Copia de la base (`supabase db dump`, esquema y datos) en `data/backups/plataforma/` del agente.
2. `20261006120000_proyectos_de_verdad.sql` con `apply_migration`.
3. `20261006120100_la_persona_tiene_ficha.sql`.
4. `20261006130000_el_segundo_factor_tambien_en_la_base.sql`.
5. `20261006130100_los_nombres_de_antes.sql`.
6. `20261006130200_la_tarea_en_un_proyecto_suyo.sql`.
7. Comprobar: `select count(*) from pg_policies where policyname like '%_segundo_factor'` (una por tabla con RLS
   más la de Storage) y que la app abre `/tareas/proyectos`.
8. Sólo entonces, fusionar la rama a la de producción.

Si el dueño ya tiene un factor verificado, desde el paso 4 una sesión `aal1` deja de ver datos: es lo que se busca, y
la app ya le pide el código en `/verificar`.

Detalles que importan:

- **Claves compuestas.** Toda referencia nueva es `(x_id, user_id) → (id, user_id)`: la base no deja colgar una fila
  tuya de algo de otro aunque se conozca su id (una clave foránea se comprueba sin RLS).
- **`field_src`**: quién escribió cada campo (`owner`, `claude`, `bot`). Lo que tocas en la app queda como tuyo; el
  importador nunca lo pisa.
- **`tasks_items.origin`** nace nula en las tareas de antes (la app lo traduce: Notion si tiene `notion_page_id`) y
  con `'A_MANO'` por defecto en las nuevas.
- **Subtareas**: borrar la tarea madre las suelta (`on delete set null`), no se las lleva: la papelera no las
  archivaría.
- `cloud_level` existe pero sólo se construye `COMPLETA`; un archivo «solo títulos» o «reservado» se rechaza entero.

### Cómo aplicarlas

**No usar `supabase db push`**: las versiones remotas no coinciden con los nombres de los archivos (ver la nota de E0).
Se aplican de una en una, en orden, con `apply_migration` (o el editor SQL), después de una copia de la base.

### Cómo probarlas sin tocar la base real

```bash
PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres bash scripts/probar-migraciones-local.sh
```

Crea una base de usar y tirar en un Postgres 15+ local, le pone lo mínimo de Supabase (`supabase/tests/bootstrap-local.sql`:
roles, `auth.uid()`, permisos por defecto), aplica **todas** las migraciones en orden y corre
`supabase/tests/*.prueba.sql`. `proyectos-de-verdad.prueba.sql` comprueba con dos usuarios inventados y el anónimo que
nadie ve ni toca lo de otro, que las claves compuestas paran los cruces, que la versión la sube la base, que la ficha
guarda la anterior, que un enlace sólo puede ser `http(s)` y qué pasa al borrar. CI lo corre en cada push (job
`migraciones`, con `postgres:17`).

## Importar desde Claude

El formato del archivo está en el repo del agente (`docs/proyectos-plantilla.md` y la skill
`.claude/skills/proyecto/`). En la plataforma:

| Pieza | Dónde |
|---|---|
| Lector (corre en el navegador) y escritor («Exportar para Claude») | `src/modules/tasks/domain/project-file.ts` |
| Validación de lo que manda el navegador (zod estricto) | `src/modules/tasks/domain/project-file-schema.ts` |
| El plan («Así lo entendí»), puro | `src/modules/tasks/domain/project-import.ts` |
| Aplicar y exportar | `src/modules/tasks/project-actions.ts` (`planProjectImport`, `applyProjectImport`, `exportProjectForClaude`) |

Reglas que prueban los tests: nunca borra; nunca pisa un campo del dueño; una tarea o un hito hechos no se reabren;
repetir no duplica (los ids nacen en el navegador, UUIDv7, y las altas son `on conflict (id) do nothing`); al aplicar,
el servidor recalcula el plan y sólo sigue si su huella es la que se enseñó; un archivo `.privado` se rechaza antes de
mandar nada (por el nombre —`x.privado.md`, `x-privado.md`, `privado.md`—, por `privado: sí` en la cabecera o por un
encabezado que diga «privado»); una sección «Montos», «Contrapartes» o «Contratos» se avisa.

Renombrar en la app no duplica al volver a importar: el nombre de antes de una persona pasa a sus alias y el título de
antes de una tarea o un hito a `former_titles`, y el importador casa también con ellos. Lo que se parece a algo que ya
existe, las secciones que se saltan y los nombres que parecen frases salen en «Míralo antes de crear», encima del
botón, que pide «Lo he mirado: crear igual».

Una tarea puede colgar de un hito en el archivo: `- [ ] Título — @persona — 2026-10-15 — hito: Título del hito`.

## Segundo factor (TOTP)

Supabase Auth MFA con una app de códigos. Ajustes → «Segundo factor» inscribe un teléfono (QR, primer código). Desde
que hay un factor verificado, el guardián (`src/lib/supabase/middleware.ts`) y `requireUser` exigen sesión `aal2` en
toda ruta privada y mandan a `/verificar`. Sin factor no se pide nada (la lista de proyectos invita a activarlo): nadie
se queda fuera. El nivel se conserva al refrescar la sesión, así que se pide una vez por teléfono. Si se pierde el
teléfono: entrar con el otro inscrito o quitar el factor en Supabase (Authentication → Users).

Desde `20261006130000` la regla vive también en la base: cada tabla con RLS tiene una política restrictiva
`*_segundo_factor`, así que con la contraseña sola no se lee nada ni por PostgREST, ni por Storage, ni por Realtime.
Una tabla nueva tiene que traer la suya (lo vigila `supabase/tests/segundo-factor.prueba.sql`).

En el teléfono, «Abrir en la app de códigos» usa el enlace `otpauth://` (el QR no se puede escanear con el mismo
aparato) y «Cancelar» quita el factor a medio inscribir.

Pruebas: `src/lib/auth/mfa.test.ts`, `src/lib/auth/require-user.test.ts`, `src/lib/supabase/middleware.test.ts`
(sin `aal2`, ninguna ruta privada se ve una vez inscrito), `src/app/api/paper/tick/route.test.ts` (tampoco el ciclo
del simulador) y `supabase/tests/segundo-factor.prueba.sql` (la base).

## Copia de seguridad

`src/lib/backup/tables.ts` dice qué tablas entran en la copia programada y cuáles no, con su porqué; las ocho de los
proyectos entran, y en el orden en que habría que restaurarlas. `tables.test.ts` lee las migraciones: una tabla nueva
con `user_id` que no esté en ninguna de las dos listas hace fallar la prueba.

## Tus tareas y las de otros

Hoy, `/tareas`, Todas y las cifras del día cuentan como tuyas sólo las tareas sin responsable y las de tu fila «Yo»;
las subtareas van con su madre. Las de otros salen en «Esperando a otros» (portada y Hoy) y con el filtro «De otros»
de Todas, con el nombre de quien la hace.
