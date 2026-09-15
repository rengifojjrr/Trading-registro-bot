# Las encuestas

Preguntas de una en una, en vez de un formulario con todos los huecos a la vista.

Empezó en el diario de trading y funcionó por un motivo que no tiene nada que ver con el trading: **un formulario de dieciséis campos vacíos se cierra y una pregunta sola se contesta**. Así que el motor vive en `core/encuesta` y lo usan todos los módulos; cada uno pone sus preguntas y qué hacer con cada respuesta.

| Dónde | Preguntas |
|---|---|
| `lib/journal/survey.ts` | Al cerrar una operación |
| `modules/sleep/domain/encuesta.ts` | Antes de dormir, y al despertar |

El resto de este documento describe la de trading, que es la primera y la que fijó las decisiones.

## El problema que resuelve

El diario completo existe desde la primera fase y casi no se rellenaba. No por falta de ganas: es un formulario de dieciséis campos que aparece cuando ya has cerrado y te ibas, y ver dieciséis huecos vacíos a la vez es justo lo que hace cerrar la pestaña.

Ya había un recordatorio (`lib/journal/check-pending.ts`, avisa a las seis horas) y una bandeja (`/journal`) donde encontrar lo pendiente. Las dos resuelven *encontrar* las operaciones sin apuntar. Ninguna resuelve lo otro: que rellenarlas cuesta demasiado.

Así que **no se añade ni un dato nuevo**. Se escribe en las mismas columnas de siempre; lo que cambia es cómo se pregunta.

## Qué se pregunta

| # | Pregunta | Dónde acaba |
|---|---|---|
| 1 | ¿Seguiste tu plan? | `journal_entries.plan_adherence` (1-5) |
| 2 | ¿Qué tal estuvo la entrada? | `journal_entries.entry_quality` (1-5) |
| 3 | ¿Cómo estabas mientras tanto? | `journal_entries.emotional_state` |
| 4 | ¿Se coló algún error? | `trade_mistakes` (una fila por error) |
| 5 | ¿Qué te llevas de ésta? | `journal_entries.lesson_learned` |

Tres criterios para esta lista y no otra:

- **Sólo lo que la aplicación no puede saber.** El precio, el tamaño, la duración y el resultado ya salen de las ejecuciones reales. Preguntarlos sería pedir que escribas a mano, peor, algo que ya está bien.
- **Vocabularios cerrados** en el ánimo y los errores, los mismos de `lib/journal/options.ts` y `lib/journal/mistakes.ts`. Texto libre no se puede contar, y la pregunta que de verdad cambia cómo operas -- «¿qué error me cuesta más dinero?» -- sólo se responde contando.
- **Una sola pregunta abierta**, la última, porque es la que hace que el diario se pueda releer dentro de seis meses.

La primera separa la decisión del resultado a propósito, y la ayuda lo dice en voz alta («da igual cómo acabó»): una decisión buena puede perder dinero y una mala puede ganarlo, y confundirlas es la forma más rápida de aprender exactamente lo contrario de lo que pasó.

Las etiquetas del 1 al 5 son **distintas en cada pregunta**. El número guardado es el mismo, pero un 5 de «seguir el plan» y un 5 de «calidad de la entrada» no significan lo mismo, y una escala genérica («Muy bien») hace que cada uno acabe puntuando con su vara.

## Por qué se contesta

- **Una pregunta en pantalla**, con la siguiente escondida. Saber que quedan cuatro es distinto de tener las cinco delante.
- **Se responde tocando.** Cuatro de las cinco son botones.
- **Las notas avanzan solas.** Tocar «Casi todo» y que la pregunta cambie sin un segundo clic es la diferencia entre cinco toques y diez.
- **Cada respuesta se guarda al instante**, no al final. Contestas dos, te llaman por teléfono, y las dos están guardadas. Un formulario que sólo guarda al final convierte cualquier interrupción en trabajo perdido, y trabajo perdido una vez es un formulario que ya no se abre más.
- **Teclado**: 1-5 elige nota, Enter avanza, Esc cierra. Escribiendo la lección los números son números y Enter es un salto de línea -- secuestrarlos dejaría la última pregunta sin poder contestarse.
- **«Ninguno» no es lo mismo que «Saltar».** Sin ese botón, no haber sentido nada raro y no querer contestar se escriben igual, y luego no hay forma de distinguirlos.
- **Cerrarla no es un fracaso.** El botón dice «Saltar» mientras no hayas contestado y «Siguiente» cuando sí.

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

## Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `core/encuesta/pasos.ts` | El recorrido, sin pantalla y sin red: qué preguntas hay, cuál está contestada, por dónde se sigue, qué resumen se enseña. Puro, probado entero. |
| `core/encuesta/encuesta.tsx` | El componente: una pregunta, la barra de avance y el pie. Sirve en un cuadro que sale solo (trading) y en línea dentro de una página (sueño). |
| `lib/journal/survey.ts` | Las cinco preguntas del diario y la frontera entre el diccionario del motor y el tipo cerrado del módulo. |
| `lib/journal/survey-queries.ts` | A qué operación toca preguntarle. |
| `lib/journal/written.ts` | Cuándo cuenta una operación como apuntada. Un solo criterio para el aviso, la bandeja y la encuesta. |
| `app/(dashboard)/trades/survey-actions.ts` | Guardar una respuesta; cerrar la encuesta. |
| `components/journal/trade-survey.tsx` | El cuadro. |
| `components/journal/survey-gate.tsx` | Que salga sola, o con un botón. |
| `components/journal/survey-launcher.tsx` | Buscar la candidata y montarla. |
