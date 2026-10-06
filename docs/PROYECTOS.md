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

Dos migraciones, **sólo aditivas** (ni un `drop` ni un `update` de filas que existen):

| Migración | Qué hace |
|---|---|
| `20261006120000_proyectos_de_verdad.sql` | Columnas nuevas en `tasks_projects` y `tasks_items`; tablas `core_people`, `tasks_project_members`, `tasks_streams`, `tasks_milestones`, `tasks_project_log`, `tasks_project_docs`, `tasks_project_doc_versions`, `tasks_project_sources`; RLS `(select auth.uid()) = user_id` en todas; disparadores de `version` y de versiones de la ficha |
| `20261006120100_la_persona_tiene_ficha.sql` | `entity_kind` gana `PERSONA` (comentarios, ficheros, vínculos y papelera para personas) |

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
mandar nada.

## Segundo factor (TOTP)

Supabase Auth MFA con una app de códigos. Ajustes → «Segundo factor» inscribe un teléfono (QR, primer código). Desde
que hay un factor verificado, el guardián (`src/lib/supabase/middleware.ts`) y `requireUser` exigen sesión `aal2` en
toda ruta privada y mandan a `/verificar`. Sin factor no se pide nada (la lista de proyectos invita a activarlo): nadie
se queda fuera. El nivel se conserva al refrescar la sesión, así que se pide una vez por teléfono. Si se pierde el
teléfono: entrar con el otro inscrito o quitar el factor en Supabase (Authentication → Users).

Pruebas: `src/lib/auth/mfa.test.ts`, `src/lib/auth/require-user.test.ts` y `src/lib/supabase/middleware.test.ts`
(sin `aal2`, ninguna ruta privada se ve una vez inscrito).
