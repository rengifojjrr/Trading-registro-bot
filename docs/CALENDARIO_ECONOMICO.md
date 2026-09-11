# Calendario económico

Qué se publica, cuándo, y qué tienes abierto cuando salga. Vive en `/noticias`, dentro del módulo de trading.

## Por qué existe

La aplicación ya sabía tu posición al detalle. Lo que no sabía era el contexto: que el IPC sale a las 12:30 UTC del jueves. Operando futuros apalancados, esa ignorancia es la que convierte un movimiento normal en una liquidación — y las liquidaciones de esta cuenta ya están documentadas en `docs/COINBASE_INTEGRATION.md`.

Lo que aporta y que ningún calendario externo puede dar: **poner las dos mitades juntas**. «El IPC sale en 45 minutos y tienes 22 contratos abiertos» sólo lo puede decir algo que sepa las dos cosas a la vez.

## De dónde salen los datos

Del endpoint público del calendario económico de TradingView (`economic-calendar.tradingview.com/events`), el mismo que alimenta el widget que cualquiera puede incrustar en una web. No pide clave ni cuenta.

**No está documentado**, y eso condiciona el diseño entero:

- Todo el conocimiento de su esquema vive en `src/lib/economic-calendar/tradingview.ts`, detrás de la interfaz `EconomicCalendarPort`. Es el mismo patrón que los venues de Coinbase: sustituir la fuente por una de pago con contrato es cambiar un archivo.
- Cada campo se lee a la defensiva y el evento se descarta si le falta lo imprescindible (identificador, título, país, fecha válida). Ningún `NaN` llega a la pantalla.
- Lo que llega se guarda en `economic_events`. La pantalla lee siempre de la tabla, nunca de la fuente en directo: el día que el endpoint deje de responder se dejará de saber lo que viene, pero no se pierde nada de lo ya sabido.

### El tope de 2000 resultados

La fuente corta en 2000 eventos por petición **sin decirlo**: devuelve una lista corta con `status: "ok"` y se calla. Verificado el 2026-09-09 pidiendo de marzo a septiembre de 2026 — devolvió 2000 eventos y el último era del 26 de agosto; septiembre entero faltaba, sin ningún error.

Por eso `syncEconomicCalendar` parte la ventana en tramos de sesenta días (`chunks()`, probado en `sync.test.ts`). Es una defensa contra un fallo que no se ve: no daría error, se notaría meses después como huecos en la agenda.

## Cómo se sincroniza

`POST /api/economic-calendar/sync`, que llama el componente `RefreshCalendar` al abrir la pantalla — el mismo patrón que `SyncOnVisit` con Coinbase, y por la misma razón: en el plan Hobby de Vercel las tareas programadas corren una vez al día, y un calendario que se entera del IPC a la mañana siguiente no sirve para lo que existe.

- **Cuándo corre.** Como mucho cada quince minutos. La decisión vive en el servidor, no en el navegador: dos pestañas abiertas no disparan dos sincronizaciones.
- **Cuánto trae.** De −10 a +60 días en marcha normal. Mientras el evento más antiguo guardado no llegue a 300 días atrás, trae 400 días: es lo que hace que «las últimas veces que salió este dato» tenga algo que enseñar desde el principio, y lo que permite que un relleno que se quedó a medias (porque se agotó el tiempo de la función) **se complete solo** en la siguiente pasada. La condición mira el evento más antiguo y no «¿hay filas?» justamente por eso.
- **Un evento cambia después de existir.** Nace con previsión y dato previo, y el dato real le aparece el día que se publica. Así que la sincronización no inserta lo nuevo: reescribe la ventana entera, con clave de idempotencia `(source, source_event_id)`.
- **Nunca lanza.** Un tramo que falla no invalida los que entraron: el calendario queda incompleto, no roto.

La hora de la última sincronización sale de `max(fetched_at)` de la propia tabla, no de una tabla de estado aparte — una tabla de estado más sería una cosa más que puede desincronizarse de la realidad que dice describir.

## Qué se enseña

**Lo próximo** — el siguiente evento de alto impacto, con cuenta atrás en vivo, previsión, dato previo, y las últimas cuatro publicaciones del mismo indicador con lo que se esperaba frente a lo que salió. Ese historial es lo que convierte una previsión en algo que se puede juzgar: saber que se espera un 0,3 % no dice nada hasta que ves que las tres veces pasadas salió por encima.

**El aviso de posición** — cuando faltan menos de dos horas para el evento **y** tienes contratos abiertos. Sólo entonces: un aviso que sale siempre es un aviso que se ignora.

**La agenda** — por días, en tu zona horaria (un dato de las 12:30 UTC cae a las 07:30 en Bogotá, y una agenda en otro huso no sirve para saber si es hoy). Cada fila entra en su ficha.

**Los filtros** son dos ejes que se combinan y se conservan entre sí:

- **Impacto**: `Importantes` (alto + medio, el de entrada), `Alto`, `Medio`, `Bajo`, `Todo`. Los tres niveles sueltos existen porque preparar la semana y averiguar por qué se movió el precio a una hora rara son dos tareas distintas: la primera sólo quiere lo grande, la segunda necesita ver hasta lo pequeño.
- **Tema**: las categorías de la fuente, traducidas. Se calculan **de los datos de la ventana**, no de la lista de las doce posibles: un filtro que ofrece «Energía» y al pulsarlo no enseña nada es un filtro roto.

## La ficha de un dato (`/noticias/[eventId]`)

Tres bloques, en este orden:

**Qué mide.** Explicación propia en español para los datos que se conocen bien (`indicator-guide.ts`), con la definición original de la fuente plegada debajo. Para un dato sin ficha propia, sólo la de la fuente — en inglés, pero verdadera.

**Cómo se suele leer.** Qué significa que salga por encima o por debajo de lo previsto, explicado por el mecanismo: un IPC alto empuja a la Reserva Federal a mantener los tipos altos, y el dinero caro resta apetito por activos de riesgo. Cuando el dato ya salió, se resalta la lectura que de hecho aplica.

Esto es lo más delicado de todo el módulo, así que el encuadre es explícito en la propia pantalla: es la lectura habitual, no una predicción; lo que mueve el precio suele ser la sorpresa y no el nivel; y cuando el dato venía descontado, a veces pasa lo contrario. **Un indicador que no esté en el catálogo no recibe interpretación inventada** — es preferible callar a improvisar una explicación macro plausible.

**Cómo reaccionó el mercado.** Lo que hizo el precio después de cada una de las últimas seis publicaciones del mismo indicador: la lista comparativa, el gráfico de velas con el instante exacto marcado, y la tabla de plazos.

Es la respuesta honesta a «qué podría pasar»: no una predicción, sino lo que de hecho pasó, medido.

### Dos selectores, no tres

La sección entera (`market-reaction-section.tsx`) es cliente, y esto no es un detalle de implementación: **comparar dos publicaciones es para lo que sirve**. Cuando cada publicación era un enlace con `?ref=`, elegir otra recargaba la página y devolvía la vista arriba del todo, así que comparar costaba dos viajes y dos vueltas a bajar con la rueda. Ahora sólo se mueve el gráfico.

De paso desaparecieron dos selectores de tiempo que parecían el mismo. Quedan dos, y cada uno vive junto a lo que cambia:

- **Medir a** (15 min · 1 h · 2 h · 4 h), arriba de la lista: cuánto después del dato se mide. Manda sobre la columna comparativa, sobre la flecha del gráfico y sobre qué columna de la tabla va resaltada.
- **Velas de** (1 min · 5 min · 15 min · 1 h), dentro del gráfico: el tamaño de vela. Es cosa del dibujo y no de la medida, y mezclarlas era justo la confusión.

Las velas de la primera publicación llegan con el HTML; las demás se piden al elegirlas, con la respuesta guardada para que volver a una ya vista sea instantáneo. La publicación dibujada y sus velas son **un solo estado**: si se cambiara la una antes que las otras, durante un instante la cabecera diría una fecha y el gráfico enseñaría otra. Mientras llegan, lo de abajo sigue siendo lo anterior, atenuado.

### Cuatro plazos, no uno

Se mide a **15 minutos, 1 hora, 2 horas y 4 horas**. La tabla de la publicación seleccionada enseña los cuatro a la vez, para que leer la fila de «acabó» de izquierda a derecha cuente la historia: si el golpe fue inmediato y se deshizo, si tardó en arrancar, o si se dio la vuelta.

Que no baste con una cifra no es teórico. El PPI del 13 de agosto de 2026, sobre el contrato que se opera:

| Plazo | Acabó | Llegó a moverse | Recorrido |
|---|---|---|---|
| 15 min | 0,00 % | 0,21 % | 0,38 % |
| 1 h | +0,02 % | 0,35 % | 0,57 % |
| 2 h | **+0,33 %** | 0,48 % | 0,69 % |
| 4 h | **−0,24 %** | 0,65 % | 1,06 % |

Con la cifra de una hora sola, ese dato «no movió el mercado». A las dos horas estaba un 0,33 % arriba y a las cuatro se había dado la vuelta. El movimiento llegó después de la ventana en la que casi todo el mundo deja de mirar.

### Por qué «llegó a moverse» y no sólo «dónde acabó»

En la misma tabla: a la hora el precio estaba prácticamente igual, pero llegó a alejarse un 0,354 % y recorrió un 0,567 % entre máximo y mínimo. Mirando sólo dónde acabó, ese dato «no hizo nada». Con apalancamiento, el viaje de ida es lo que liquida una posición.

### Decir «no se sabe» cuando no se sabe

Un plazo cuyo histórico de velas no alcanza queda en blanco, nunca con el último precio disponible. Sin eso, el precio de la hora y media se colaría como si fuera el de las cuatro horas — el fallo más fácil de cometer aquí, y el más difícil de detectar mirando la pantalla. Hay margen de cinco minutos para los huecos normales de mercado, que no son lo mismo que un histórico corto.

Todas las cifras de arriba son el fixture de `market-reaction.real.test.ts`: la medición se prueba contra cuatro horas de velas reales, con sus huecos y sus mechas, no sólo contra números redondos.

### El gráfico

Empezó siendo un SVG fijo: se veía la ventana que la aplicación decidía y ni una vela más. Servía para responder «cuánto se movió» y no para lo siguiente que uno quiere hacer, que es mirar antes y después — qué venía haciendo el precio esa mañana, si el movimiento aguantó a la tarde. Para eso hace falta desplazar y ampliar, y eso es un gráfico, no un dibujo.

Ahora es `lightweight-charts`, la misma librería que el gráfico de una operación, con:

- **Desplazamiento y zoom**, y **carga de más velas al llegar al borde**: se pide el tramo de al lado por `/api/economic-calendar/candles` y se funde con lo que ya había. Nunca más allá de ahora — pedir el futuro devuelve vacío y volvería a pedirlo en cada arrastre.
- **Temporalidades** de 1 min, 5 min, 15 min y 1 hora. Cada ventana inicial cabe en las ~300 velas por petición que devuelve Coinbase (comprobado: 299, 300, 296 y 298).
- **Barra de precios** con el OHLC de la vela bajo el cursor, fija arriba y no en un globo flotante, que taparía justo la zona que se mira. Acaba en **«vs. antes»**: dónde está esa vela respecto al precio de justo antes del dato, que es la cifra que se viene a leer — la variación contra su propia apertura no dice nada aquí.
- **Marcas**: una flecha en la publicación, otra al final del plazo medido, y la línea de puntos del precio previo. Son marcadores de la librería y no líneas dibujadas encima porque es lo que aguanta bien al ampliar y desplazar. Se **reutilizan** en vez de recrearse con cada tramo: creándolas de nuevo se apilaban, y el gráfico acababa con tres etiquetas «antes del dato» superpuestas en el eje, que además no eran el mismo precio.
- **Horas en tu zona** en el eje y en el crosshair: sin `tickMarkFormatter` la librería las pinta en UTC y el gráfico contradiría a la tabla de al lado. Los precios van con separador de miles por lo mismo: 77.284,77 se lee de un vistazo y 77284.77 hay que contarlo.
- **Botón de centrar**, porque tras pasearse por la sesión entera hace falta una forma de volver sin recargar. Reencuadra contando **velas** y no minutos: con minutos fijos, «los 45 minutos anteriores» es menos de una vela en la temporalidad de una hora, y el gráfico salía con el dato pegado a un borde.
- **Alto según el ancho** (320 px en móvil, 420 px a partir de `sm`): lo decide el CSS y el gráfico lo sigue, en vez de un alto fijo que en pantalla grande deja las velas aplastadas.

La paleta sale de `lib/charts/tema-canvas.ts`, que ya era el sitio único donde se resuelven los tokens del tema para un canvas y de donde beben las gráficas de operaciones y de bots. Un canvas no entiende `var(--positive)`, así que hay que resolverlo en tiempo de ejecución; tenerlo en un solo módulo es lo que impide que dos gráficos de la misma aplicación acaben con dos verdes distintos. `conAlfa` se movió ahí desde el componente del gráfico de operaciones por lo mismo.

**Lo que este gráfico no trae, a propósito:** herramientas de dibujo, indicadores ni capturas. Todo eso vive en el gráfico de una operación y se guarda contra ella (`chart_drawings.trade_id` es `not null` con clave ajena a `trades`); aquí no hay operación a la que atarlo, y hacerlo genérico costaría reescribir un componente de 2.500 líneas —`entry`, `exit`, `fills` y `direction` suman unas setenta referencias, y siete rutas de API cuelgan del identificador de la operación— para portar cosas que sobre la reacción del IPC de mayo nadie va a volver a mirar.

### Las velas

Del endpoint **público** de mercado de Coinbase (`api.coinbase.com/api/v3/brokerage/market/products/…/candles`), que no pide firma ni clave. Es deliberado: el resto de la aplicación necesita credenciales porque lee *tu* cuenta, pero el precio de Bitcoin del 13 de agosto no es de nadie. Así esta parte funciona aunque Coinbase no esté configurado y no gasta cuota de la clave privada dibujando gráficos.

Se pide sobre el **producto que operas** (`COINBASE_PRODUCT_ID`), no sobre el contado: un futuro con vencimiento lejano cotiza muy por encima —78.000 frente a 63.000 el mismo día de agosto—, así que enseñar el contado como si fuera lo tuyo confundiría. Si ese producto no tiene velas de aquella fecha (un contrato que aún no existía), se cae a `BTC-USD` y la pantalla dice cuál usó.

Comprobado el 2026-09-09: hay velas de un minuto de hace más de un año, tanto del contado como del contrato.

La ventana que se pide es de −30 a +270 minutos: son 300 velas de un minuto, justo por debajo del tope de 350 por petición que impone Coinbase. Cubre el plazo más largo que se mide con margen para que la última vela no caiga en el borde. Un plazo mayor exigiría paginar o bajar la granularidad.

## Lo que esto NO hace

**No predice el precio de Bitcoin.** Dice qué se publica, cuándo, qué se espera y qué salió. Nada más.

Dos consecuencias concretas en el código:

- El nivel de impacto es el que marca la fuente, y así se dice en la pantalla. No es un juicio de la aplicación.
- Una sorpresa se pinta en ámbar, nunca en verde o rojo. Que un dato salga por encima de lo previsto no es bueno ni malo: depende de qué dato sea y de cómo estés posicionado. Marcarlo en verde sería una opinión disfrazada de dato — y el rojo y el verde ya significan otra cosa en esta aplicación (pérdida y ganancia), así que prestarlos a un segundo significado es cómo se dejan de leer los dos.

La lista de lo que «se mira para Bitcoin» (`CLAVES_PARA_BITCOIN` en `relevance.ts`) es una lista corta y a mano — inflación, empleo, la Reserva Federal, crecimiento — más lo que la fuente marque como de alto impacto. Dice «de esto se habla», no «esto va a subir».

## Alcance actual

- **Sólo Estados Unidos** (`COUNTRIES` en `relevance.ts`). Es de donde salen la Reserva Federal y los datos que mueven el apetito por riesgo global; añadir la zona euro doblaría la lista para ganar dos o tres publicaciones al mes. Es una constante y no una opción de configuración porque hoy no hay razón para tocarla.
- La tabla es de **referencia**, sin `user_id`: que la Reserva Federal decida tipos el miércoles es un hecho del mundo, igual que el tamaño de un contrato en `products`. Misma política de RLS que aquélla — cualquiera autenticado lee, sólo el service role escribe.

## Lo que queda por hacer

- **Guardar las reacciones medidas.** Hoy se calculan al abrir la ficha, con una petición de velas por publicación (seis, en paralelo, cacheadas una hora). Guardarlas en una tabla permitiría responder preguntas agregadas que ahora no se pueden hacer: «de media, ¿cuánto mueve el IPC frente al PPI?», o «¿qué datos mueven de verdad este contrato?».
- **Aviso al móvil** antes de un evento de alto impacto con posición abierta, reutilizando `push_subscriptions`.
- **Marcar la operación** con los eventos que ocurrieron mientras estaba abierta, para que el diario pueda responder «¿cuánto de esto fue el mercado y cuánto fui yo?».
- **Ampliar el catálogo** de `indicator-guide.ts`. Cubre los datos que mueven el mercado; los que no están caen a la definición de la fuente, que es correcta pero está en inglés y no explica cómo se lee.
