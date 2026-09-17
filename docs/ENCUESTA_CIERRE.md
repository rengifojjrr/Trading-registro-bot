# Las encuestas

Preguntas de una en una, en vez de un formulario con todos los huecos a la vista.

Empezó en el diario de trading y funcionó por un motivo que no tiene nada que ver con el trading: **un formulario de dieciséis campos vacíos se cierra y una pregunta sola se contesta**. Así que el motor vive en `core/encuesta` y lo usan todos los módulos; cada uno pone sus preguntas y qué hacer con cada respuesta.

| Dónde | Preguntas |
|---|---|
| `lib/journal/plan.ts` | **Antes** de entrar en una operación (`docs/PLAN_PREVIO.md`) |
| `lib/journal/survey.ts` | Al cerrar una operación |
| `modules/sleep/domain/encuesta.ts` | Antes de dormir, y al despertar |
| `modules/reading/domain/encuesta.ts` | Al acabar un rato de lectura |
| `modules/meals/domain/encuesta.ts` | Al apuntar o planificar una comida |
| `modules/tasks/domain/encuesta.ts` | Al rellenar la ficha de una tarea |
| `modules/content/domain/encuesta.ts` | Al rellenar la ficha de una pieza |

Los siete módulos están cubiertos salvo **hábitos**, que no tiene formulario largo que arreglar y se queda como está -- el porqué, más abajo.

El resto de este documento describe la del **cierre**, que es la primera y la que fijó las decisiones.

## El problema que resuelve

El diario completo existe desde la primera fase y casi no se rellenaba. No por falta de ganas: es un formulario de dieciséis campos que aparece cuando ya has cerrado y te ibas, y ver dieciséis huecos vacíos a la vez es justo lo que hace cerrar la pestaña.

Ya había un recordatorio (`lib/journal/check-pending.ts`, avisa a las seis horas) y una bandeja (`/journal`) donde encontrar lo pendiente. Las dos resuelven *encontrar* las operaciones sin apuntar. Ninguna resuelve lo otro: que rellenarlas cuesta demasiado.

Así que **no se añade ni un dato nuevo**. Se escribe en las mismas columnas de siempre; lo que cambia es cómo se pregunta.

## Qué se pregunta

| # | Pregunta | Dónde acaba |
|---|---|---|
| 0 | ¿Es ésta la que planificaste? | `journal_entries.plan_id` y `plan_followed` |
| 1 | ¿Qué tal era el setup? | Etiqueta `Setup: A+` (`trade_tags`) |
| 2 | ¿Seguiste tu plan? | `journal_entries.plan_adherence` (1-5) |
| 3 | ¿Qué tal estuvo la entrada? | `journal_entries.entry_quality` (1-5) |
| 4 | ¿Cómo estabas mientras tanto? | `journal_entries.emotional_state` |
| 5 | ¿Se coló algún error? | `trade_mistakes` (una fila por error) |
| 6 | ¿Qué te llevas de ésta? | `journal_entries.lesson_learned` |

La cero **sólo aparece cuando dejaste un plan escrito antes de entrar**, y entonces va delante de todo: de su respuesta depende qué significan las demás, porque «¿seguiste tu plan?» es otra pregunta cuando hay un plan escrito delante que cuando el plan es el que recuerdas ahora. Decir que sí muda el stop, el objetivo y la foto del plan a la operación. Está entero en `docs/PLAN_PREVIO.md`.

El setup va **primero de las de siempre porque es lo primero que pasó**: la entrada se decide mirando el setup, y preguntarlo después de «¿cómo estabas?» obliga a rebobinar. Cada nota lleva escrito al lado qué cuenta como esa nota («B: aceptable, algo forzado»), que es lo que hace que un B de marzo y uno de octubre signifiquen lo mismo y que contar cuánto rinde cada nota diga algo. No es columna del diario sino etiqueta, porque así la dejó la importación de Notion y una operación no puede tener dos sitios distintos para lo mismo; se lee de ahí al abrir (`setupPorOperacion`) para no volver a preguntar lo que ya estaba puesto.

Tres criterios para esta lista y no otra:

- **Sólo lo que la aplicación no puede saber.** El precio, el tamaño, la duración y el resultado ya salen de las ejecuciones reales. Preguntarlos sería pedir que escribas a mano, peor, algo que ya está bien.
- **Vocabularios cerrados** en el ánimo y los errores, los mismos de `lib/journal/options.ts` y `lib/journal/mistakes.ts`. Texto libre no se puede contar, y la pregunta que de verdad cambia cómo operas -- «¿qué error me cuesta más dinero?» -- sólo se responde contando.
- **Una sola pregunta abierta**, la última, porque es la que hace que el diario se pueda releer dentro de seis meses.

La del plan separa la decisión del resultado a propósito, y la ayuda lo dice en voz alta («da igual cómo acabó»): una decisión buena puede perder dinero y una mala puede ganarlo, y confundirlas es la forma más rápida de aprender exactamente lo contrario de lo que pasó.

Las etiquetas del 1 al 5 son **distintas en cada pregunta**. El número guardado es el mismo, pero un 5 de «seguir el plan» y un 5 de «calidad de la entrada» no significan lo mismo, y una escala genérica («Muy bien») hace que cada uno acabe puntuando con su vara.

## Por qué se contesta

- **Una pregunta en pantalla**, con la siguiente escondida. Saber que quedan cinco es distinto de tener las seis delante.
- **Se responde tocando.** Todas menos la última son botones.
- **Las notas avanzan solas.** Tocar «Casi todo» y que la pregunta cambie sin un segundo clic es la diferencia entre seis toques y doce.
- **Cada respuesta se guarda al instante**, no al final. Contestas dos, te llaman por teléfono, y las dos están guardadas. Un formulario que sólo guarda al final convierte cualquier interrupción en trabajo perdido, y trabajo perdido una vez es un formulario que ya no se abre más.
- **Y nadie se la quita de delante.** Ver abajo.
- **Teclado**: 1-5 elige nota, Enter avanza, Esc cierra. Escribiendo la lección los números son números y Enter es un salto de línea -- secuestrarlos dejaría la última pregunta sin poder contestarse.
- **«Ninguno» no es lo mismo que «Saltar».** Sin ese botón, no haber sentido nada raro y no querer contestar se escriben igual, y luego no hay forma de distinguirlos.
- **Cerrarla no es un fracaso.** El botón dice «Saltar» mientras no hayas contestado y «Siguiente» cuando sí.

## Por qué no se cierra sola

Durante un tiempo **se cerraba a media contestación**, casi siempre. La cadena:

1. Cada respuesta se guardaba con una Server Action.
2. Toda Server Action refresca la ruta actual al terminar.
3. La ruta actual es `/trading`, que vuelve a preguntar qué operación encuestar.
4. Al contestar «¿cómo estabas?» se escribe `emotional_state`, así que la operación ya cuenta como apuntada (`hasJournalContent`) y deja de ser candidata.
5. `SurveyLauncher` devolvía `null` y el cuadro se desmontaba con la encuesta a medias.

Está arreglado en dos capas, y las dos hacen falta:

- **Guardar va por `/api/trades/[tradeId]/survey`**, una ruta normal, no una acción. Un `fetch` no refresca nada. Es la misma razón, escrita en el mismo sitio, por la que los dibujos del gráfico son una ruta y no una acción.
- **`SurveyGate` echa el pestillo**: la primera candidata que llega se queda en su estado y sólo la cierra quien la está contestando. Que el servidor deje de proponerla ya no puede desmontarla, venga el repintado de donde venga. El servidor propone; una vez abierta, manda la pantalla.

Cerrar una respuesta a cerrar la encuesta **sí** es una Server Action (`closeSurvey`): se llama cuando el cuadro ya ha desaparecido, así que su refresco no puede desmontar nada y encima es lo que se quiere, que el panel se entere.

`survey-gate.test.tsx` fija esto: con la encuesta abierta, que la prop pase a `null` no la cierra.

## Cuándo sale sola

`lib/journal/survey-queries.ts`, tres condiciones:

1. **Cerrada hace menos de `VENTANA_DIAS` (3).** Corto a propósito: la encuesta es «la que acabas de terminar», no una herramienta para vaciar atrasos. Preguntar de golpe por algo de hace doce días es pedir un recuerdo que ya no existe, y lo que se conteste entonces es inventado. Lo viejo sigue en la bandeja del diario, a su ritmo.
2. **Sin apuntar**, según `lib/journal/written.ts`.
3. **Sin cerrar antes** (`journal_entries.survey_closed_at`). Una encuesta que reaparece después de descartarla se cierra sin leer a la segunda, y a partir de ahí ya nunca se contesta.

A diferencia del aviso de la sincronización **no hay margen de cortesía**: el aviso molesta a las seis horas porque persigue, y la encuesta aparece enseguida porque es justo cuando todavía te acuerdas.

Sale en `/trading`, dentro de un `Suspense` para que las cifras del panel no esperen por ella. Y se puede abrir a mano desde la ficha de cualquier operación cerrada (`SurveyPrompt`), que es lo que convierte «ahora no» en algo que se puede pulsar sin culpa.

## `survey_closed_at`

Una columna, un significado: la encuesta se abrió para esta operación y se cerró, contestada o no.

No se puede deducir de lo escrito -- quien la cierra sin contestar no deja rastro en ninguna columna del diario --, y no distingue «contestada» de «saltada» porque para decidir si vuelve a salir las dos son lo mismo. Lo que se contestó ya está en las columnas de al lado.

**Las notas del 1 al 5 no cuentan como «apuntada»** (`hasJournalContent`). Son un toque, no algo escrito: si contaran, una encuesta abandonada en la segunda pregunta se leería como una operación apuntada y nadie volvería a ella.

## Cuando la fila todavía no existe

Las tres primeras encuestas escriben sobre algo que ya está en la base: una operación cerrada, la noche de hoy, un plan que se crea al abrir el cuadro. Siempre hay a quién escribirle, así que guardar una respuesta es un `update` y ya.

**Lecturas rompe eso**, y es el caso que se van a encontrar comidas y tareas: de lecturas hay las que quieras el mismo día, así que no hay ninguna clave por la que buscar la fila --no es «la lectura del 15 de marzo»-- y no puede existir antes de que se conteste algo. Las reglas que salieron de ahí:

- **La primera respuesta crea la fila y devuelve su id**; la pantalla se queda con él y las demás respuestas ya escriben encima. Sin eso, cada pregunta crearía su propia fila y un rato de veinte minutos acabaría siendo seis lecturas vacías.
- **Saltar no crea nada.** El motor manda un guardado también al saltar una pregunta --así es como se borra lo que ya había escrito--, así que el servidor tiene que distinguir «contestado en blanco» de «no contestado» y no insertar por lo segundo. Si no, abrir la encuesta y saltárselo todo deja una fila en blanco cada vez.
- **Lo que viene contestado de serie no cuenta como contestado.** El día viene puesto en hoy; por sí solo no crea la fila, y la pantalla final no dice «apuntada» si es lo único que hay. Anunciar que se ha guardado algo que no se ha guardado es peor que no anunciar nada.

**Comidas añade una vuelta más**: `name` y `meal_type` son `not null`, así que la fila no puede nacer de una respuesta suelta como nace una lectura -- hace falta el nombre. Por eso cada guardado lleva **todo lo contestado hasta ahora** y no sólo la respuesta: cuando por fin llega el nombre, la comida nace con lo que ya había escrito en vez de perderlo. Es también lo que deja que aplicar una plantilla --nombre, tipo e ingredientes de un toque-- sea una sola llamada.

## Cuando lo que se escribe se toca muchas veces

Una noche, una lectura o una operación se escriben **una vez** y se archivan. Una tarea no: se apunta en un segundo --«llamar al fontanero»-- y luego se toca durante días. Son dos usos distintos y la encuesta sola sólo sirve para el primero, así que tareas hace tres cosas diferentes y conviene no «arreglarlas»:

- **Apuntar sigue siendo un campo y un botón** (`modules/tasks/ui/new-task.tsx`). Eso ya era lo más rápido que podía ser; convertirlo en encuesta lo haría más lento. El formulario largo de este módulo era el de la ficha, no el de apuntar.
- **Una tarea a medias abre en la primera pregunta sin contestar**, que es el camino de quien la capturó con prisa y ahora se sienta a decidir de qué proyecto es y para cuándo.
- **Una tarea entera abre en su ficha** --`pasoInicial=""`, la pantalla final-- con todo a la vista y cada línea saltando a su pregunta. Cambiarle la fecha no puede costar recorrer nueve preguntas, y es lo que más se hace con una tarea.

Las preguntas sin contestar salen en la ficha con un guión, y también se tocan. Es lo que la convierte en el índice de la encuesta en vez de en un resumen de lo hecho: los huecos se ven, y por eso se acaban rellenando.

**Contenido funciona igual** y por lo mismo: una idea se apunta en un segundo y la pieza se toca durante dos meses mientras baja por los diez estados. El índice vive en `core/encuesta/ficha.tsx`, compartido por los dos.

Dónde va la barra de plantillas es la diferencia entre los dos módulos que la tienen. En **comidas** va encima de la encuesta, porque una plantilla ahí es lo que rellena la comida entera de un toque. En **contenido** va en la ficha, porque es ahí donde están los campos que una plantilla copia --la forma de la pieza: tipo, canal, plataforma, estilo de edición--, mientras que al apuntar la idea sólo se aplican.

## El módulo que no la lleva

**Hábitos se queda como está, a propósito.** Es el único de los siete que no tiene formulario largo que arreglar:

- Crear un hábito son dos campos --emoji y nombre-- y un botón. Que eso sea trivial es la mitad del argumento del módulo: en Notion añadir un hábito significa añadir una columna y el histórico nunca la tiene.
- Marcar un día es **un bit**. No hay nada que preguntar: la rejilla de días se toca y ya está, y la ausencia de fila significa «no hecho», no «sin datos».

Una encuesta ahí añadiría pasos a lo que ya es un toque. La encuesta existe para el formulario que nadie rellena entero, y hábitos no tiene ninguno; convertirlo sería aplicar el remedio donde no está la enfermedad.

## La pregunta de un día

`tipo: "fecha"` (`core/encuesta/pasos.ts`) se estrenó en lecturas y vale para cualquier módulo. Dos decisiones que no son obvias:

- **Los atajos son relativos** --«Hoy», «Ayer», «Anteayer»-- y no fechas literales, porque la lista de pasos se escribe una vez y se usa todos los días.
- **El día de referencia lo pone quien llama**, no el reloj del navegador: a las once de la noche en Bogotá ya es mañana en UTC, y el rato de lectura se archivaría en el día siguiente. Es la misma lección que `core/today.ts`.

Que el día sea una pregunta más --y no un campo oculto con el de hoy-- es lo que deja apuntar el rato de anoche. Antes había que crearlo hoy y luego editarlo.

## Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `core/encuesta/pasos.ts` | El recorrido, sin pantalla y sin red: qué preguntas hay, cuál está contestada, por dónde se sigue, qué resumen se enseña. Puro, probado entero. |
| `core/encuesta/encuesta.tsx` | El componente: una pregunta, la barra de avance y el pie. Sirve en un cuadro que sale solo (trading) y en línea dentro de una página (sueño). |
| `lib/journal/survey.ts` | Las seis preguntas del diario --siete con la del plan-- y la frontera entre el diccionario del motor y el tipo cerrado del módulo. |
| `lib/journal/survey-queries.ts` | A qué operación toca preguntarle, y con qué viene ya contestado. |
| `lib/journal/survey-store.ts` | Dónde acaba cada respuesta. Sin pantalla y sin HTTP, para que la ruta y la acción escriban lo mismo. |
| `lib/journal/written.ts` | Cuándo cuenta una operación como apuntada. Un solo criterio para el aviso, la bandeja y la encuesta. |
| `app/api/trades/[tradeId]/survey/route.ts` | Guardar una respuesta. Ruta y no acción, por lo de arriba. |
| `app/(dashboard)/trades/survey-actions.ts` | Cerrar la encuesta, ya con el cuadro fuera de pantalla. |
| `components/journal/trade-survey.tsx` | El cuadro. |
| `components/journal/survey-gate.tsx` | Que salga sola --y que no se la quite nadie--, o con un botón. |
| `components/journal/survey-launcher.tsx` | Buscar la candidata y montarla. |
| `modules/reading/domain/encuesta.ts` | Las preguntas de un rato de lectura, con los libros de quien contesta. |
| `modules/reading/ui/reading-survey.tsx` | La encuesta de lecturas, en línea en la página. Registra y corrige con el mismo componente. |
| `modules/reading/actions.ts` | `saveReadingAnswer`: crea la lectura con la primera respuesta y escribe encima con las demás. |
| `modules/meals/domain/encuesta.ts` | Las preguntas de una comida, y cuándo puede nacer. |
| `modules/meals/ui/meal-survey.tsx` | La encuesta de comidas, con la barra de plantillas encima. |
| `modules/meals/actions.ts` | `saveMealAnswer`: la fila nace del nombre, con todo lo contestado dentro. Los ingredientes se reescriben enteros. |
| `modules/tasks/domain/encuesta.ts` | Las preguntas de una tarea, con los proyectos de quien contesta. |
| `modules/tasks/ui/task-survey.tsx` | La ficha de una tarea: encuesta para rellenarla, resumen tocable para corregirla. |
| `modules/tasks/actions.ts` | `saveTaskAnswer`: una columna por respuesta. Marcar «hecha» sella el cierre igual que el círculo de la lista. |
| `core/encuesta/ficha.tsx` | El índice tocable: lo contestado y lo que falta, cada línea a su pregunta. Lo usan tareas y contenido. |
| `modules/content/domain/encuesta.ts` | Las dieciocho preguntas de una pieza, con los diez estados agrupados por tramo. |
| `modules/content/ui/new-piece.tsx` | Apuntar la idea: un título, un botón y la barra de plantillas. |
| `modules/content/ui/piece-survey.tsx` | La ficha de una pieza. |
| `modules/content/actions.ts` | `savePieceAnswer`: tres respuestas no son una columna --los hitos son tres booleanos, los tiempos son etiquetas que se traducen a minutos. |
