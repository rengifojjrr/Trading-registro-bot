import "server-only";

import { createHmac } from "node:crypto";

/**
 * Cliente REST firmado de la API v5 de Bybit.
 *
 * Existe para el paper trading: la cuenta demo de Bybit tiene API de verdad
 * --misma forma que la de dinero real, con saldo ficticio-- así que las
 * operaciones de prácticas entran por el mismo camino que las de Coinbase, se
 * reconstruyen con el mismo motor y se les calcula el P&L con la misma
 * función. Sin esto la única alternativa era exportar un CSV a mano.
 *
 * `baseUrl` es un parámetro y no una constante a propósito: lo único que
 * separa la cuenta demo de la de dinero real es el host
 * (`api-demo.bybit.com` frente a `api.bybit.com`), y una constante enterrada
 * aquí convertiría «apuntar a la cuenta buena» en algo que hay que recordar.
 * Quien construye el cliente lo dice.
 *
 * NO PROBADO CONTRA BYBIT: escrito desde la documentación oficial, sin
 * credenciales todavía. Cada campo traza a un campo documentado; nada está
 * adivinado. Igual que el cliente de Coinbase en su día, no se puede dar por
 * bueno hasta que haga una petición real.
 */

/** El de la cuenta demo. Ver la nota de `baseUrl` arriba. */
export const BYBIT_DEMO_URL = "https://api-demo.bybit.com";

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 500;

/**
 * Cuánto tiempo acepta Bybit que tarde en llegar la petición.
 *
 * La regla es `hora_del_servidor - recvWindow <= timestamp < hora_del_servidor
 * + 1000`, así que esto es en realidad la tolerancia al desfase de **nuestro**
 * reloj. El de por defecto de Bybit son 5.000 ms; aquí van 10.000 porque el
 * coste de ser generoso es nulo --la firma sigue caducando en diez segundos--
 * y el de ser estricto es una sincronización que falla en un contenedor cuyo
 * reloj va medio segundo atrasado, con un error que no dice que sea eso.
 */
const RECV_WINDOW_MS = 10_000;

export interface BybitClientConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

export class BybitApiError extends Error {
  constructor(
    message: string,
    readonly retCode: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "BybitApiError";
  }
}

/**
 * Los `retCode` que merecen otro intento.
 *
 * 10006 y 10018 son límite de peticiones y 10016 es «el servicio no está»:
 * los tres dicen «vuelve luego», no «lo has pedido mal». El resto son errores
 * de la petición y reintentarlos sólo gasta tiempo para recibir lo mismo.
 */
const RETCODES_QUE_SE_REINTENTAN = new Set([10006, 10016, 10018]);

/** «Tu reloj no cuadra con el mío». Se dice aparte porque el mensaje importa. */
const RETCODE_TIMESTAMP = 10002;

interface Envoltura<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

export class BybitRestClient {
  constructor(private readonly config: BybitClientConfig) {}

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    // La cadena de consulta se construye UNA vez y se usa para firmar y para
    // pedir. Es la trampa de esta API: se firma el texto exacto de la query,
    // así que volver a serializar los parámetros para la URL --aunque salga un
    // texto equivalente, con las claves en otro orden-- da una firma que no
    // valida, y el error que devuelve Bybit habla de la firma y no del orden.
    const query = cadenaDeConsulta(params);
    const url = `${this.config.baseUrl}${path}${query ? `?${query}` : ""}`;

    let intento = 0;
    let espera = INITIAL_BACKOFF_MS;

    for (;;) {
      const timestamp = String(Date.now());
      const firma = firmaDeBybit({
        timestamp,
        apiKey: this.config.apiKey,
        apiSecret: this.config.apiSecret,
        recvWindow: RECV_WINDOW_MS,
        query,
      });

      const respuesta = await fetch(url, {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": this.config.apiKey,
          "X-BAPI-TIMESTAMP": timestamp,
          "X-BAPI-RECV-WINDOW": String(RECV_WINDOW_MS),
          "X-BAPI-SIGN": firma,
        },
        // Nunca cacheable: cada llamada lleva su timestamp y su firma, así que
        // una caché que indexe por cabeceras no acertaría nunca de todas
        // formas. Lo que haya que cachear se cachea por encima de esta capa.
        cache: "no-store",
      });

      intento += 1;

      if (!respuesta.ok) {
        const reintentable = respuesta.status === 429 || respuesta.status >= 500;
        if (!reintentable || intento > MAX_RETRIES) {
          // Sin cuerpo ni cabeceras en el mensaje: podrían llevar metadatos de
          // la petición, y el estado más la ruta bastan para diagnosticar sin
          // arriesgarse a que acaben en un registro. Misma regla que el
          // cliente de Coinbase.
          throw new BybitApiError(
            `Bybit respondió ${respuesta.status} a ${path}`,
            respuesta.status,
            path,
          );
        }
        await dormir(espera);
        espera *= 2;
        continue;
      }

      const cuerpo = (await respuesta.json()) as Envoltura<T>;

      if (cuerpo.retCode === 0) return cuerpo.result;

      if (cuerpo.retCode === RETCODE_TIMESTAMP) {
        // Merece su propio mensaje: es el fallo que más se parece a «las
        // credenciales están mal» sin serlo, y perseguir una clave que
        // funciona porque el error no lo dijo cuesta una tarde.
        throw new BybitApiError(
          `Bybit rechazó la hora de la petición (retCode ${cuerpo.retCode}). ` +
            `No son las credenciales: es que el reloj de este servidor va desfasado más de ` +
            `${RECV_WINDOW_MS / 1000} segundos respecto al de Bybit.`,
          cuerpo.retCode,
          path,
        );
      }

      if (RETCODES_QUE_SE_REINTENTAN.has(cuerpo.retCode) && intento <= MAX_RETRIES) {
        await dormir(espera);
        espera *= 2;
        continue;
      }

      throw new BybitApiError(
        `Bybit rechazó ${path} (retCode ${cuerpo.retCode}: ${cuerpo.retMsg})`,
        cuerpo.retCode,
        path,
      );
    }
  }

  /**
   * Vacía un endpoint paginado por cursor, entregando una página a la vez.
   *
   * Quedarse sin páginas con Bybit diciendo que hay más revienta en vez de
   * devolver lo que haya. Es la misma decisión que en el cliente de Coinbase y
   * por el mismo motivo --un hueco en los datos no puede pasar en silencio--
   * pero aquí pesa más: la cuenta demo de Bybit borra a los siete días, así
   * que un hueco que no se vea hoy no se puede recuperar la semana que viene.
   * Un error ruidoso deja las cifras viejas, que se sabe que son viejas.
   */
  async *paginar<TItem>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    maxPaginas = 200,
  ): AsyncGenerator<TItem[]> {
    let cursor: string | undefined;

    for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
      const resultado = await this.get<{ list?: TItem[]; nextPageCursor?: string }>(path, {
        ...params,
        cursor,
      });

      const items = resultado.list ?? [];
      yield items;

      // Bybit devuelve una cadena vacía --no la omite-- cuando no hay más.
      const siguiente = resultado.nextPageCursor;
      if (!siguiente || items.length === 0) return;
      cursor = siguiente;
    }

    throw new Error(
      `Bybit sigue devolviendo páginas de ${path} después de ${maxPaginas}. ` +
        `La sincronización se detiene en vez de guardar un histórico incompleto.`,
    );
  }
}

/**
 * La firma de una petición GET, exactamente como la quiere Bybit.
 *
 * `HMAC_SHA256(timestamp + apiKey + recvWindow + queryString)` en hexadecimal
 * minúscula. Los cuatro trozos van pegados, sin separador y **en ese orden**:
 * cambiarlo produce una firma perfectamente válida que Bybit rechaza, y lo que
 * contesta habla de la firma sin decir que el problema es el orden.
 *
 * Suelta y exportada para poder fijarla con un vector conocido. Es la línea con
 * más probabilidad de estar mal de todo el fichero y la única cuyo fallo no se
 * puede diagnosticar leyendo el error.
 */
export function firmaDeBybit(params: {
  timestamp: string;
  apiKey: string;
  apiSecret: string;
  recvWindow: number;
  query: string;
}): string {
  return createHmac("sha256", params.apiSecret)
    .update(`${params.timestamp}${params.apiKey}${params.recvWindow}${params.query}`)
    .digest("hex");
}

/**
 * Los parámetros, ordenados y sin los vacíos.
 *
 * Ordenados por clave para que la misma llamada produzca siempre el mismo
 * texto: lo que se firma es esta cadena, y dos llamadas equivalentes que
 * generaran dos órdenes distintas harían imposible reproducir una firma para
 * depurarla. Bybit no exige el orden alfabético, pero sí que lo firmado y lo
 * enviado sean idénticos, y eso se consigue teniendo una sola función.
 */
export function cadenaDeConsulta(params: Record<string, string | number | undefined>): string {
  const busqueda = new URLSearchParams();
  for (const clave of Object.keys(params).sort()) {
    const valor = params[clave];
    if (valor !== undefined && valor !== "") busqueda.set(clave, String(valor));
  }
  return busqueda.toString();
}

function dormir(ms: number): Promise<void> {
  return new Promise((listo) => setTimeout(listo, ms));
}
