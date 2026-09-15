# Titulares

Lo que mueve el precio y no está en ningún calendario.

## El problema

El calendario económico sabe de lo programado: el IPC sale el día 12 a las 12:30 desde hace décadas, y la aplicación te avisa. Eso deja fuera media realidad.

El 15 de septiembre de 2026 el Senado de Estados Unidos no consiguió sacar adelante la Ley CLARITY. Bitcoin cayó un 2,64 %. La aplicación no dijo absolutamente nada, porque aquella votación no estaba en ninguna agenda — y un hackeo, un ETF aprobado o una frase de Powell fuera de guion tampoco lo están.

## La decisión de fondo: medir, no opinar

Lo natural habría sido clasificar la importancia de un titular por sus palabras — «Senado», «hackeo», «ETF» — y habría estado mal **en los dos sentidos**: hay titulares con forma de catástrofe que el mercado se traga sin pestañear, y frases anodinas detrás de una caída del 3 %.

Adivinar cuáles importan es justamente el trabajo que una aplicación con velas de un minuto y la hora exacta de publicación **no tiene que hacer**: puede mirar.

Así que para cada titular se mide, con la misma maquinaria que ya usaba el calendario (`measureReaction` sobre velas de un minuto), qué hizo el precio en la hora siguiente. Lo que se marca no es «esta noticia es importante» sino **«después de esta noticia el precio se movió tanto»**.

Y la pantalla es honesta sobre lo que eso no dice: que el precio se moviera después no demuestra que se moviera *por* ello.

| Grado | Umbral (movimiento máximo en 1 h) | Se marca |
|---|---|---|
| Sin medir | todavía no hace una hora | no |
| Quieto | menos de 0,5 % | no |
| Movió | 0,5 % o más | sí |
| Movió mucho | 1,5 % o más | sí, más fuerte |

«Sin medir» y «quieto» tienen textos distintos a propósito: uno es «todavía no lo sabemos» y el otro «lo miramos y no pasó nada». Confundirlos es prometer una certeza que no hay.

Comprobado contra la fuente real el 2026-09-15: de los seis titulares medibles de aquel día, «Acciones cripto caen antes de la votación del Clarity Act y la decisión de la Fed» salió marcado (+1,03 % en una hora, llegó a 1,10 %) y los otros cinco quedaron en quieto, entre 0,11 % y 0,38 %.

## Los temas sí salen de las palabras

De qué va una noticia se lee en su título; cuánto importa, no. Son dos preguntas distintas y por eso se responden de dos formas distintas.

`lib/market-news/temas.ts` casa palabras sobre el titular, en orden, con ocho familias: regulación, ETF, macro, seguridad, tesorerías, adopción, minería y mercado. Son las que históricamente mueven Bitcoin en minutos.

Un titular puede tener **varios** temas — «Acciones cripto caen antes de la votación del Clarity Act y la decisión de la Fed» es regulación *y* macro — porque forzar uno solo obligaría a elegir por el usuario, y en un filtro eso es esconderle la mitad.

**Cuando ninguna regla casa, el titular se queda sin tema** en vez de recibir uno plausible. Un filtro por temas sólo sirve si los temas son ciertos.

## La fuente

Dos endpoints públicos sin documentar de TradingView, comprobados el 2026-09-15:

| Qué | Dónde |
|---|---|
| La lista, 25 por página con cursor | `news-mediator.tradingview.com/news-flow/v2/news` |
| El cuerpo de uno | `news-headlines.tradingview.com/v3/story` |

Son **hosts distintos**, y eso costó encontrarlo: el mismo camino de la historia bajo `news-mediator` devuelve 404, y pedírsela al de la lista sin `filter` devuelve 400. Los dos exigen `Origin` y `Referer` de tradingview.com, igual que el del calendario.

Se lee **a la defensiva**. Un titular al que le falte lo esencial — identificador, título o fecha — se descarta y los demás pasan: caerse entera porque una de veinticinco noticias venga rara sería cambiar una pantalla incompleta por ninguna pantalla.

Lo esencial es esos tres y no más: sin identificador no se deduplica, sin fecha no se puede medir qué hizo el precio (que es la mitad del valor de todo esto) y sin título no hay nada que enseñar.

## Cuándo se trae

Dos caminos, como el calendario:

- **Al abrir la pantalla** (`RefreshNews` → `/api/market-news/sync`). En el plan Hobby de Vercel las tareas programadas corren una vez al día, y unos titulares que se enteran mañana de lo que pasó esta tarde no sirven para lo que existen.
- **En el cron de sincronización**, una vez y no por cuenta, dentro de un `try`: que la fuente de noticias esté caída no puede hacer que la sincronización de operaciones conste como fallida.

El resumen se pide **sólo para los titulares que aún no están guardados**: es una petición por titular, y volver a pedirlo en cada sincronización serían cien peticiones cada cuarto de hora para no cambiar nada.

Las mediciones van aparte y a su ritmo (`MEDICIONES_POR_VUELTA = 12`), sobre los que ya cumplieron `MINUTOS_PARA_MEDIR` (75). El margen sobre los sesenta es a propósito: medir «la hora siguiente» de un titular de hace sesenta y un minutos da una vela y media, y de ahí sale algo que parece una cifra y no lo es.

Un titular se marca como medido **aunque no haya salido cifra**. Sin esa marca, uno de una madrugada sin velas se reintentaría en cada sincronización para siempre.

## Dónde se ve

| Pantalla | Qué enseña |
|---|---|
| `/noticias` | Los últimos tres días, debajo de «Lo próximo»: primero lo que viene, luego lo que ya pasó sin avisar, y al final el calendario. |
| `/trading` | Sólo los que movieron, bajo el título «Me he perdido algo». En el panel no cabe una lista de veinticinco titulares al día. |

El titular enlaza a la fuente y se abre fuera. El cuerpo entero está allí y copiarlo aquí sería republicar lo que no es nuestro; lo que sí es nuestro — cuándo salió y qué hizo el precio — está en la misma fila.

## Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `lib/market-news/types.ts` | La interfaz de la que depende la pantalla. La fuente es reemplazable. |
| `lib/market-news/tradingview.ts` | La única fuente hoy, leída a la defensiva. |
| `lib/market-news/temas.ts` | De qué va un titular, por reglas. Puro y probado. |
| `lib/market-news/relevancia.ts` | Cuánto importó, por lo medido. Puro. |
| `lib/market-news/sync.ts` | Traer, clasificar y medir. |
| `lib/market-news/queries.ts` | Lo que lee la pantalla, siempre de la tabla. |
| `components/market-news/news-feed.tsx` | La lista. |
| `components/market-news/refresh-news.tsx` | El empujón al abrir. |
