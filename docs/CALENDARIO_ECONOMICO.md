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

**La agenda** — por días, en tu zona horaria (un dato de las 12:30 UTC cae a las 07:30 en Bogotá, y una agenda en otro huso no sirve para saber si es hoy). Por defecto esconde lo de impacto bajo — subastas de letras e inventarios de crudo, cuarenta filas al día que entierran las tres que importan; «Todo» lo enseña.

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

- **Qué hizo Bitcoin la última vez.** Con las velas que ya sabe pedir la aplicación (`fetchTradeCandles`) se puede medir el movimiento real en los quince minutos posteriores a cada publicación pasada. Es la respuesta más honesta a «qué podría pasar»: no una predicción, sino lo que de hecho pasó las últimas seis veces.
- **Aviso al móvil** antes de un evento de alto impacto con posición abierta, reutilizando `push_subscriptions`.
- **Marcar la operación** con los eventos que ocurrieron mientras estaba abierta, para que el diario pueda responder «¿cuánto de esto fue el mercado y cuánto fui yo?».
