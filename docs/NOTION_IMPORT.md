# Importación histórica desde Notion

Herramienta de respaldo (`scripts/import-notion-journal.ts`, `npm run import:notion -- <email>`) que trae el historial de un diario de trading manual en Notion a esta plataforma. Es un **backfill puntual**, no una vía de sincronización en vivo: se corre cuando el usuario lo pide (por ejemplo, tras agregar operaciones nuevas al Notion), nunca automáticamente.

Todo lo que crea queda marcado sin ambigüedad como de origen manual:

- `trades.source = 'NOTION_IMPORT'` (nunca `COINBASE_SYNC`)
- `accounts.venue = 'EXTERNAL'` / `products.venue = 'EXTERNAL'`
- `products.product_id` termina en `-EXTERNAL` (p. ej. `MBT-EXTERNAL`)
- Cada trade importado queda enlazado 1:1 a la página de Notion de origen en `notion_import_links` (única por `notion_page_id`, así que volver a correr el script nunca duplica una operación)

## Por qué cada campo se mapea así

El Notion real ("📈 Trading Journal") no es un log de fills -- es una fila manual por operación ya cerrada, con un solo precio de entrada y uno de salida. Esto obliga a varias decisiones que no aplican al pipeline de Coinbase:

| Campo Notion | Destino | Razón |
|---|---|---|
| `Trade` (title) | -- (solo queda en `notion_import_links.raw_properties` para auditoría) | Es un rótulo libre que el usuario escribía a mano (a veces con `$`, a veces sin), no un dato estructurado. |
| `Fecha` (una sola fecha, sin hora) | `opened_at` **y** `closed_at`, ambos a medianoche UTC de ese día | Notion nunca registró hora de entrada/salida por separado. Poner ambos campos en el mismo instante es la opción honesta: `duration_seconds` sale en 0 en vez de inventar una duración. La fecha se ancla en UTC (no en la zona del usuario) para no arriesgar un corrimiento de día al convertir una fecha-sin-hora ambigua. |
| `Ticker` (multi-select) | `product_id` sintético | La mayoría de filas tiene un solo ticker. Cuando hay más de uno (p. ej. `MBT`+`MNQ`), Notion no dice a cuál de los dos corresponde el precio de entrada/salida registrado -- inventar esa asociación sería peor que ser explícito. Se crea un producto combinado (`MBT+MNQ-EXTERNAL`) y la operación queda marcada en sus notas para revisión manual. |
| `Entrada` / `Salida` = `0` | `entry_wap` / `exit_wap` = `null` (no `0`) | `0` no es un precio real de BTC/MBT/MNQ -- significa "no se registró". Guardar `0` sería mostrar un precio falso. |
| `Setup` (`A+`/`A`/`B`/`C`) | Tag `"Setup: X"` (tabla `tags`, vía `trade_tags`) | Es una nota de calidad del setup, no el nombre de una estrategia -- mezclarlo con `Estrategia` habría perdido la distinción que el propio usuario hacía. |
| `Estrategia` (multi-select) | `journal_entries.strategy_id` (solo el primer valor) + el resto listado en las notas | `strategy_id` es una sola FK; Notion permitía marcar varias. Se prioriza el primero y el resto queda visible, no se descarta. `"ninguna"/"ninguno"` se trata como "sin estrategia" (no crea una fila `strategies` vacía). |
| `Sesión` (multi-select: NY/TOKIO/SYDNEY/LONDON) | **Ninguno** (no se escribe `session_computed` ni `session_override`) | La clasificación de sesión de esta plataforma exige un instante real (hora exacta) para poder aplicar las reglas DST correctas -- ver `lib/sessions/classify.ts`. Como `Fecha` no tiene hora, calcular una sesión aquí sería una sesión inventada, no calculada. El valor que Notion traía se deja igualmente disponible dentro de las notas, sin usarlo para clasificar nada. |
| `Puntuación` (0-10) | Texto en las notas (`"Puntuación (Notion, escala 0-10): N"`) | `journal_entries.entry_quality` es 1-5 por restricción de la base de datos; reescalar 0-10 a 1-5 perdería precisión y podría producir un `0` inválido. Se conserva el número original en vez de forzarlo a otra escala. |
| `Emociones`, `Errores` (multi-select) | `emotional_state`, `mistake_tag` (texto, unidos con `", "`) | Estos campos de `journal_entries` son texto libre, no enumerados -- unir la lista es una conversión sin pérdida. |
| `trend ` (multi-select; nombre con espacio final en Notion) | `htf_bias` | Es el análogo más cercano ya existente en el esquema. |
| `Notas`, `Revisión post-trade`, `Donde ?`, `Seleccionar` | Todo dentro de `journal_entries.notes`, en secciones separadas y rotuladas | No hay un campo estructurado 1:1 para "dónde operabas" o "en vivo vs. solo" -- en vez de forzarlos a un campo que no encaja, quedan como texto legible, nunca se pierden. |
| `PnL` | `net_pnl` (tal cual, **sin recalcular**) | Los precios de Notion (`Entrada`/`Salida`) tienen inconsistencias de escala reales entre filas del mismo ticker (ver más abajo) -- recalcular el P&L a partir de esos precios habría producido cifras peores que las que el usuario ya validó a mano. El `PnL` de Notion se trata como la fuente de verdad; ver la nota de metodología que cada operación importada trae en sus propias notas. |
| `PnL` + `Comisiones` | `gross_pnl` (estimado: `PnL + Comisiones`) | Es una aproximación explícita, no un recálculo desde precios -- se documenta como tal en cada operación. |
| `Capturas`, `Plan pre-mercado` (archivos) | **No migrados todavía** -- se cuenta cuántos había y se deja una nota de aviso por operación, con enlace a la página original de Notion | Requiere descargar cada archivo de Notion y volver a subirlo al storage de esta plataforma; queda pendiente para una fase posterior. Nunca se oculta que faltan -- cada operación con archivos sin migrar lo dice explícitamente en sus notas. |

## Avisos que el script genera (y nunca oculta)

Por cada corrida con operaciones nuevas, se crea una notificación (`type='DISCREPANCY'`, visible en Actividad) con el resumen de:

- Cuántas operaciones tenían varios tickers combinados en una sola fila
- Cuántas tenían precio de entrada/salida sin registrar
- Cuántas tenían el `PnL` numérico inconsistente con el resultado marcado (p. ej. `PnL` positivo pero `Resultado = Perdedor` -- ocurrió varias veces en los datos reales del usuario; el número siempre gana sobre la etiqueta, pero la inconsistencia se señala para revisión)
- Cuántos archivos adjuntos quedaron sin migrar

Cada una de estas situaciones también queda anotada, operación por operación, dentro de `journal_entries.notes` -- nunca solo en el resumen agregado.

## Cuentas y productos que crea

Una fila `accounts` por cada valor distinto de la propiedad `Cuenta` de Notion que realmente aparezca en los datos (no una por cada opción *definida* en el select de Notion, aunque nunca se haya usado). Igual para los productos sintéticos por ticker. Esto evita cuentas o productos vacíos que no representan nada real.

---

# El calendario de contenido (módulo Contenido)

Esto es una importación **distinta e independiente** de la del diario de
trading, y va en la dirección contraria.

| | Trading | Contenido |
|---|---|---|
| Base de datos | `NOTION_DATABASE_ID` | `NOTION_CONTENT_DATABASE_ID` |
| Dirección | La aplicación escribe hacia Notion (espejo de salida) | Notion se lee hacia la aplicación |
| Cuándo corre | Cola con reintentos, tras cada cambio | A mano, desde el botón en `/contenido` |

La razón de la dirección es quién trabaja dónde: el editor de vídeo usa el
calendario de Notion a diario, así que mientras siga ahí, **Notion manda en
Contenido y la aplicación refleja**. Dos direcciones exigirían resolver
conflictos -- él cambia el estado allí, tú aquí, ¿cuál gana? -- y ese problema
no hace falta tenerlo todavía. El día que se le abra esta aplicación, se apaga
la importación y la dirección se invierte de golpe, sin un periodo en el que
las dos escriban.

## Qué se traduce

La base de origen es **📷 Social Media Content Calendar**. El mapeo vive en
`src/modules/content/domain/notion-mapping.ts` y está cubierto por tests, que
es donde conviene mirar primero si algo llega mal.

Tres decisiones que no son obvias:

1. **Los tiempos dejan de ser texto.** En Notion, «Tiempo de Edicion» es un
   multi-select con opciones como «2 Horas» o «1 Dia». De una etiqueta de texto
   no sale una media, así que aquí se guardan minutos. El formulario de la
   aplicación sigue ofreciendo exactamente las mismas opciones, de modo que
   escribir en un sitio o en otro se siente igual.

2. **«despues de las 10 deje de contar» se conserva como lo que es.** No es una
   duración, es la ausencia de una. Se guarda su suelo (600 minutos) con la
   marca `edit_time_uncapped`, y las gráficas dicen «10 h o más» en lugar de
   afirmar diez exactas.

3. **Las opciones desconocidas se descartan y se avisan.** Un canal o un estado
   nuevo en Notion no se guarda: nuestras gráficas y filtros lo ignorarían
   igual, y guardarlo daría la falsa impresión de que la aplicación lo usa. El
   informe de la importación los lista uno por uno, que es la señal de que hay
   que añadirlos en `domain/content.ts`.

También se buscan las propiedades ignorando mayúsculas, tildes y espacios
sobrantes. Tres del calendario real llevan un espacio de más -- ` resumen`,
`Guión `, `Miniatura A/B ` -- y sin esta tolerancia, el día que alguien lo
corrija en Notion la importación dejaría de traer esos campos sin decir nada.

## Idempotencia

Cada pieza guarda `notion_page_id`, con un índice único sobre
`(user_id, notion_page_id)` -- llano y no parcial: Postgres no acepta un índice
parcial en un `ON CONFLICT` a menos que se repita su predicado, y el cliente de
Supabase no lo repite. Reimportar actualiza en lugar de duplicar, y el
informe distingue cuántas eran nuevas de cuántas se actualizaron. Las piezas
creadas dentro de la aplicación no tienen `notion_page_id` y la importación no
las toca nunca.

## Configuración

`NOTION_CONTENT_DATABASE_ID` es el identificador de 32 caracteres de la URL del
calendario. No es un secreto, pero se configura como variable de entorno para
no fijar en el código la base de nadie. Hay que compartir esa base con la misma
integración de Notion (menú «...» → Conexiones), igual que la de trading.


## El cuerpo de las páginas

Durante un tiempo la importación sólo leyó propiedades, y eso dejaba fuera
justo lo que más cuesta escribir:

- Cada pieza del calendario de contenido lleva su guion **dentro de la
  página**, con la estructura `HOOK` / `SCRIPT/NOTES` / `TAGS` que traen todas.
- Cada tarea lleva su explicación igual: «Crear Inventario» contiene «Hacer
  inventario de trendy sports».

Ahora se traen los dos. El cuerpo se traduce a Markdown --
`src/lib/notion/render-blocks.ts`, puro y con pruebas -- porque Markdown es lo
que se puede volver a escribir a mano en un área de texto sin perder nada, y
este contenido está para leerlo y editarlo, no para renderizarlo con fidelidad
tipográfica.

Cuesta **una llamada más por página**, así que sólo lo piden las dos
importaciones donde el cuerpo es el dato (`withBodies: true`). Las páginas se
piden de cinco en cinco: en serie una base de sesenta filas tarda un minuto, y
todas a la vez Notion responde 429.

Dos límites deliberados:

- **Las subpáginas se nombran pero no se siguen.** Traerlas enteras mezclaría
  dos documentos en un mismo campo de texto.
- **Se cortan a 400 bloques y a tres niveles de anidamiento.** Más allá de eso
  son listas dentro de listas que en un área de texto plano ya no se
  distinguen, y cada nivel es otra ronda de llamadas.

Si una página no deja leer sus bloques, se importa sin cuerpo y la importación
sigue: un permiso suelto no debe tumbar las otras cincuenta y nueve.

## Los iconos

Se importa el emoji de la página (💤 en los registros de sueño, 🐳 en las
piezas). Sólo emoji: un icono subido como imagen es una URL que caduca, y
guardar una URL caducada en la columna del icono deja un hueco roto para
siempre.

## Bases que la aplicación no conoce

En el espacio de Notion hay tres cosas más que **no** se importan, y conviene
que sea una decisión y no un olvido:

| Base | Por qué está fuera |
|---|---|
| «Mis Tareas» | Anterior a «✅ To-Do Base de Datos», que es la que se usa. Importarla duplicaría tareas viejas. |
| «Planificador de Comidas» (la copia suelta) | La que se importa es la que cuelga del planificador actual. |
| «Curso de trading» (MÓDULO 0 a 9) | Es material de curso, no un registro: no encaja en ninguno de los seis módulos. |

Si alguna tiene que entrar, lo que hace falta es un mapeador nuevo en
`src/modules/<módulo>/domain/notion-mapping.ts` y su variable de entorno; el
lector, la idempotencia y la interfaz de importación ya están.

## Configuración, en una tabla

| Variable | Qué base | Trae cuerpos |
|---|---|---|
| `NOTION_API_TOKEN` | -- | -- |
| `NOTION_CONTENT_DATABASE_ID` | 📷 Social Media Content Calendar | Sí (los guiones) |
| `NOTION_TASKS_DATABASE_ID` | ✅ To-Do Base de Datos | Sí (las descripciones) |
| `NOTION_SLEEP_DATABASE_ID` | Dormir | No |
| `NOTION_HABITS_DATABASE_ID` | 📆 Hábitos 2026 | No |
| `NOTION_MEALS_DATABASE_ID` | 🍳 Planificador de Comidas | No |
| `NOTION_READING_DATABASE_ID` | Leer | No |

Ninguna de estas es un secreto salvo el token. Todas se configuran en el panel
del alojamiento -- nunca pegadas en un chat ni guardadas en la base de datos --
y cada base hay que compartirla con la misma integración de Notion desde su
menú «...» → Conexiones. Sin eso, la importación devuelve «no se pudo abrir la
base de datos» aunque el identificador sea correcto.
