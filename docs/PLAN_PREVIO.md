# Planificar antes de entrar

Un botón grande, ocho preguntas de una en una, y un plan que se queda esperando a la operación que lo cumpla.

## El problema que resuelve

Todo lo que este diario sabe se escribe **después** de cerrar. Y eso deja fuera justo la mitad que decide si se opera bien: lo que pensabas antes de entrar.

Preguntarlo al cerrar no sirve. Para entonces ya sabes cómo acabó, y la memoria reescribe el plan para que encaje con el resultado — «yo tenía el stop ahí» es la frase más sincera y menos fiable del trading. La encuesta del cierre pregunta «¿seguiste tu plan?» y la respuesta, sin nada escrito delante, es una opinión sobre uno mismo formada cinco minutos después de ganar o perder dinero.

**Un plan sólo significa algo si existe antes de que haya resultado.** De ahí que esto sea una tabla aparte y no más columnas del diario:

1. **Existe sin operación.** Se planifica y puede que no se entre nunca, y eso también es un dato — de hecho es de los buenos: los planes que no ejecutaste y habrían salido bien, y los que te saltaste.
2. **Se escribe en otro momento.** El diario se escribe al cerrar; esto, al mirar el gráfico antes de abrir.
3. **La une una persona, no una regla.** Ver más abajo.

## Qué se pregunta

| # | Pregunta | Dónde acaba |
|---|---|---|
| 1 | ¿Hacia dónde crees que va? | `trade_plans.direction` |
| 2 | ¿Qué has visto? | `trade_plans.idea` |
| 3 | ¿Dónde piensas entrar? | `trade_plans.entry_price` |
| 4 | ¿Dónde te sales si te equivocas? | `trade_plans.stop_price` |
| 5 | ¿Dónde cierras si sale bien? | `trade_plans.target_price` |
| 6 | ¿Cuánto estás dispuesto a perder? | `trade_plans.risk_amount` |
| 7 | ¿Cómo llegas? | `trade_plans.emotional_state` |
| 8 | ¿Una foto del gráfico? | `trade_plans.screenshot_path` |

La dirección va primero porque es de la que cuelgan las demás: el stop de un largo está debajo y el de un corto encima, y preguntarlos sin saber qué buscas es preguntarlos a ciegas.

«¿Dónde te sales si te equivocas?» y no «¿dónde pones el stop?»: lo segundo es un trámite y lo primero es la pregunta de verdad. El precio al que admites que la idea era mala se decide antes de entrar o no se decide.

El ánimo se pregunta **antes** y no sólo después. Cómo llegas explica media operación, y al cerrar ya está teñido por el resultado.

**Todo es saltable.** Un plan a medias — sólo la dirección y el stop — es infinitamente mejor que ningún plan, y exigirlo entero es la forma segura de que no se rellene nunca.

## La cuenta, mientras escribes

Con la dirección y los tres precios puestos, aparece **cuánto ganas por cada 1 que arriesgas**.

Esa cuenta es la mitad del valor de todo esto, y sólo la tiene porque se enseña *ahí*. Un «0,4 a 1» en la pantalla, antes de entrar, es la única forma de que alguien se replantee el objetivo; enseñárselo al cerrar es contarle por qué perdió dinero cuando ya lo ha perdido.

Si el stop o el objetivo están del lado que no corresponde a la dirección, **no da un ratio**: avisa. Un stop por encima de la entrada en un largo no es un ratio pobre, es un error de tecleo, y devolver un número lo escondería. Tampoco lo impide — puede ser una estrategia rara o un precio a medio teclear.

## Cómo se une a una operación

No se deduce. Puedes planear un largo y acabar entrando corto, puedes entrar dos veces, puedes planificar y no entrar. Cualquier regla automática sobre el producto y la hora acertaría la mayoría de las veces y fallaría justo en los casos que más importan.

Así que lo contesta quien operó, en **la encuesta del cierre**: cuando hay un plan esperando, su primera pregunta pasa a ser «¿Es ésta la que planificaste?», con el plan escrito debajo — sin eso sería un test de memoria, que es exactamente el problema que planificar por escrito venía a resolver.

Tres respuestas, no dos (`journal_entries.plan_followed`):

| | Significa |
|---|---|
| `null` | Todavía no se ha preguntado |
| `true` | Sí, ésta es la operación de ese plan |
| `false` | No, ésta es otra — y el plan sigue esperando |

Guardar también el `plan_id` cuando la respuesta es «no» es lo que impide volver a preguntar por el mismo plan en la misma operación cada vez que se reabre la encuesta.

### Decir que sí muda el plan a la operación

Y eso es todo el sentido de haberlo escrito. Al confirmar:

- El **stop**, el **objetivo**, el **riesgo** y la **dirección planeada** pasan a las columnas del diario, así que el gráfico de la operación dibuja el plan que de verdad hiciste antes de entrar.
- La **foto** pasa a las capturas de la operación, en la fase «antes».

**Sin pisar nada.** Si la ficha ya tenía stop — porque lo arrastraste en el gráfico o lo escribiste a mano — ese gana: lo del plan es lo que pensabas, lo de la ficha es lo que hiciste, y cuando discrepan manda la segunda.

Un plan que se queda en su propia tabla es un papel en un cajón. Lo que sirve es que al abrir la ficha estén ahí tu stop, tu objetivo y la foto de lo que veías, al lado de lo que de verdad pasó.

## Cuándo está «esperando»

Tres condiciones, y todas son sobre no molestar:

1. **No lo descartaste** (`discarded_at`). Descartar no borra: un plan que decidiste no ejecutar es historia, y borrarla dejaría las cuentas de «cuántos planes cumplo» mintiendo por arriba.
2. **Ninguna operación ha dicho «sí, soy yo»**.
3. **Tiene algo dentro.** Abrir el botón, mirar y cerrar borra el plan en blanco. Un plan fantasma esperando en el panel es ruido, y peor: enseña que el botón hace cosas que no pediste.

El panel enseña **el último y sólo uno**. Nada impide que haya varios, pero planificar dos operaciones a la vez es raro, y una lista de planes pendientes en el panel principal sería una bandeja de tareas más — justo lo que este diario intenta no ser.

## Detalles que no son detalles

- **El botón es grande y va arriba del todo.** El momento de planificar es mientras miras el gráfico decidiendo, con prisa, y lo que hay que hacer entonces tiene que verse desde el otro lado de la habitación. Es además lo único de ese panel que se hace antes de operar.
- **Con un plan esperando, el botón se convierte en el plan.** Enseñarlo es la mitad de para qué sirve: un plan que hay que ir a buscar a otra pantalla es un plan que se olvida justo cuando toca respetarlo.
- **Cada respuesta se guarda al contestarla**, por `/api/planes/[planId]` y no por una Server Action. Una acción refresca la ruta, el panel vuelve a buscar el plan pendiente y el cuadro se desmontaría a media encuesta — el mismo fallo, y el mismo arreglo, que en `docs/ENCUESTA_CIERRE.md`.
- **La foto va por su propia ruta** (`/api/planes/[planId]/foto`): las demás respuestas son unos bytes de JSON y ésta son megas de imagen en un `multipart`. La miniatura sale del archivo local sin esperar a la red, porque verla al instante es lo que hace que subir una foto no se sienta como un envío.
- **Quitar la foto llega al servidor en el momento**, no al pasar de pregunta: la subida ya escribió la ruta allí, y quitarla y cerrar dejaría una imagen que en la pantalla ya no está y en la base de datos sí.
- **La foto vive en el bucket `trade-screenshots`**, bajo `{user_id}/planes/{plan_id}/`. El mismo bucket que las capturas porque es el mismo tipo de archivo con la misma política; la carpeta `planes/` sólo las distingue de las que cuelgan de una operación. Se sirve con dirección firmada de una hora: es un bucket privado, y una dirección eterna sería un enlace público a tu gráfico.
- **Cambiar la foto borra la anterior.** Cambiarla tres veces no puede dejar tres imágenes pagando sitio que ya nadie va a mirar.

## Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `lib/journal/plan.ts` | Las ocho preguntas, el ratio y los avisos. Puro, probado entero. |
| `lib/journal/plan-store.ts` | Dónde acaba cada respuesta, la foto, y cuál es el plan que espera. |
| `app/api/planes/[planId]/route.ts` | Guardar una respuesta. Ruta y no acción, por lo de arriba. |
| `app/api/planes/[planId]/foto/route.ts` | Subir la foto. |
| `app/(dashboard)/trading/plan-actions.ts` | Empezar, cerrar y descartar, ya con el cuadro fuera de pantalla. |
| `components/journal/plan-survey.tsx` | El cuadro y la cuenta de riesgo/beneficio. |
| `components/journal/plan-launcher.tsx` | El botón grande, y la tarjeta del plan que espera. |
| `components/journal/plan-panel.tsx` | Buscar el pendiente y montarlo. |
| `core/encuesta/` | El motor, el mismo del cierre y el sueño. Aquí estrenó dos tipos de pregunta: `numero` e `imagen`. |
