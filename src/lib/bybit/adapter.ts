import "server-only";

import type { MarketDataPort } from "@/lib/coinbase/ports";
import type {
  CoinbaseFill,
  CoinbaseListFillsParams,
  CoinbaseOrder,
  CoinbaseProduct,
} from "@/lib/coinbase/types";

import { BybitRestClient, BYBIT_DEMO_URL, type BybitClientConfig } from "./client";
import {
  esUnaEjecucionDeVerdad,
  type BybitCategory,
  type BybitExecution,
  type BybitInstrument,
  type BybitOrder,
} from "./types";

/**
 * La cuenta demo de Bybit, hablando el idioma que ya entiende esta aplicación.
 *
 * `MarketDataPort` es la costura por la que la reconstrucción y la
 * sincronización hablan con un venue: su comentario dice que existe para poder
 * cambiar de venue «sin tocar la reconstrucción, el motor de P&L ni el panel»,
 * y esto es la primera vez que se cobra esa promesa. Todo lo que hay aquí es
 * traducción; ni una decisión sobre qué significa una operación.
 *
 * Traduce a los tipos `Coinbase*` en vez de introducir unos neutros. Renombrar
 * esos tipos tocaría cuarenta archivos para no cambiar ni un comportamiento, y
 * lo que de verdad importa --que un campo de Bybit acabe en la columna que le
 * corresponde-- se ve mejor en un solo sitio pequeño que repartido en un
 * renombrado grande. Cuando haya un tercer venue será el momento de discutirlo.
 *
 * ## Lo que esta traducción NO captura, y hay que saberlo
 *
 * **El funding de los perpetuos.** `/v5/execution/list` mezcla las ejecuciones
 * con los cobros de funding, y los cobros se descartan aquí porque pasarlos por
 * ejecuciones inventaría entradas y salidas (ver `esUnaEjecucionDeVerdad`). Eso
 * significa que en `linear` e `inverse` el P&L de una posición que aguante un
 * cobro de funding sale **mejor de lo que fue**, por lo que costó el funding.
 *
 * En `spot` el problema no existe: no hay funding. Por eso `spot` es el valor
 * por defecto y lo recomendado para llevar un diario -- y por eso esta
 * limitación está escrita aquí arriba y no en una nota al pie, en vez de
 * dejar que alguien descubra dentro de tres meses que sus números de perpetuos
 * eran optimistas.
 */

/**
 * La ventana máxima que acepta `/v5/execution/list` en una petición.
 *
 * Son siete días exactos, y no es una recomendación: pedir más devuelve error.
 * El orquestador pasa un rango que puede ser mucho más largo --el primer
 * arranque pide un backfill de varios días, y una sincronización que estuvo
 * caída pide desde su última marca-- así que aquí se trocea.
 *
 * Se restan diez segundos del tope para no rozar el límite: el rango se
 * calcula con el reloj de este servidor y se valida con el de Bybit, y ir al
 * milímetro convierte medio segundo de desfase en un error.
 */
const VENTANA_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000 - 10_000;

export interface BybitAdapterConfig extends Partial<BybitClientConfig> {
  apiKey: string;
  apiSecret: string;
  category: BybitCategory;
}

export class BybitDemoAdapter implements MarketDataPort {
  readonly venue = "BYBIT_DEMO" as const;
  private readonly client: BybitRestClient;
  private readonly category: BybitCategory;

  constructor(config: BybitAdapterConfig) {
    this.client = new BybitRestClient({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      baseUrl: config.baseUrl ?? BYBIT_DEMO_URL,
    });
    this.category = config.category;
  }

  async listFills(params: CoinbaseListFillsParams): Promise<CoinbaseFill[]> {
    const desde = params.start_sequence_timestamp
      ? Date.parse(params.start_sequence_timestamp)
      : Date.now() - VENTANA_MAXIMA_MS;
    const hasta = params.end_sequence_timestamp
      ? Date.parse(params.end_sequence_timestamp)
      : Date.now();

    const simbolos = params.product_ids ?? [undefined];
    const ejecuciones: BybitExecution[] = [];

    for (const symbol of simbolos) {
      for (const tramo of tramosDeSieteDias(desde, hasta)) {
        for await (const pagina of this.client.paginar<BybitExecution>("/v5/execution/list", {
          category: this.category,
          symbol,
          startTime: tramo.desde,
          endTime: tramo.hasta,
          limit: 100,
        })) {
          ejecuciones.push(...pagina);
        }
      }
    }

    return fillsDeLasEjecuciones(ejecuciones);
  }

  async listOrders(orderIds: string[]): Promise<CoinbaseOrder[]> {
    const ordenes: CoinbaseOrder[] = [];

    // Una por una: `/v5/order/history` filtra por un `orderId` suelto, no por
    // una lista. Es lo mismo que hace el adaptador de Coinbase y por el mismo
    // motivo -- la sincronización pide las pocas órdenes que hay detrás de una
    // tanda de ejecuciones nuevas, no un volcado del histórico.
    for (const orderId of orderIds) {
      const resultado = await this.client.get<{ list?: BybitOrder[] }>("/v5/order/history", {
        category: this.category,
        orderId,
      });
      const orden = resultado.list?.[0];
      if (orden) ordenes.push(aOrdenDeCoinbase(orden));
    }

    return ordenes;
  }

  async getProduct(productId: string): Promise<CoinbaseProduct> {
    const resultado = await this.client.get<{ list?: BybitInstrument[] }>(
      "/v5/market/instruments-info",
      { category: this.category, symbol: productId },
    );

    const instrumento = resultado.list?.[0];
    if (!instrumento) {
      throw new Error(`Bybit no conoce el símbolo «${productId}» en la categoría ${this.category}.`);
    }

    return aProductoDeCoinbase(instrumento, this.category);
  }
}

/**
 * De ejecuciones de Bybit a fills, que es donde está todo lo que puede salir
 * mal sin que se note.
 *
 * Separado de `listFills` --que sólo pide páginas-- porque estas tres cosas son
 * decisiones y no fontanería, y las tres se equivocan en silencio:
 *
 * 1. **Quitar lo que no es una ejecución.** Los cobros de funding vienen en la
 *    misma lista, y colarlos inventaría entradas y salidas que nunca pasaron.
 * 2. **Deduplicar por `execId`.** Los tramos de siete días se piden con los
 *    bordes pegados y una sincronización solapa a propósito con la anterior, así
 *    que la misma ejecución puede llegar dos veces.
 * 3. **Ordenar por `execId` cuando empata la hora.** Bybit documenta que su
 *    orden no es estable con ejecuciones del mismo milisegundo, y la marca de
 *    agua de la sincronización se saca de la última: con dos en el mismo
 *    instante y orden aleatorio, la que quedara segunda podría no volver a
 *    pedirse nunca. Con la cuenta demo borrando a los siete días, eso es una
 *    operación perdida para siempre.
 */
export function fillsDeLasEjecuciones(ejecuciones: BybitExecution[]): CoinbaseFill[] {
  const unicas = new Map(ejecuciones.map((e) => [e.execId, e]));

  return [...unicas.values()]
    .filter((e) => esUnaEjecucionDeVerdad(e.execType))
    .map((e) => aFillDeCoinbase(e))
    .sort((a, b) =>
      a.sequence_timestamp === b.sequence_timestamp
        ? a.entry_id.localeCompare(b.entry_id)
        : a.sequence_timestamp.localeCompare(b.sequence_timestamp),
    );
}

/**
 * El rango partido en trozos que Bybit acepte.
 *
 * Hacia adelante y no hacia atrás: así el último trozo es el más reciente y las
 * ejecuciones llegan en el orden en el que pasaron, que es el que espera la
 * reconstrucción para ir abriendo y cerrando posiciones.
 *
 * Exportada porque es la única aritmética de este archivo que se puede
 * equivocar sola, y se prueba aparte.
 */
export function tramosDeSieteDias(
  desde: number,
  hasta: number,
): { desde: number; hasta: number }[] {
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return [];

  const tramos: { desde: number; hasta: number }[] = [];
  let cursor = desde;

  while (cursor < hasta) {
    const fin = Math.min(cursor + VENTANA_MAXIMA_MS, hasta);
    tramos.push({ desde: cursor, hasta: fin });
    // +1 ms para no pedir dos veces el instante del borde. Repetirlo no
    // rompería nada --`entry_id` es la clave de idempotencia y el mapa de
    // arriba ya quita duplicados-- pero pedir lo mismo dos veces es una
    // petición regalada a un servicio con límite.
    cursor = fin + 1;
  }

  return tramos;
}

function aFillDeCoinbase(e: BybitExecution): CoinbaseFill {
  const cuando = new Date(Number(e.execTime)).toISOString();

  return {
    // `execId` es único por ejecución y es lo que hace idempotente la
    // sincronización: `raw_fills` tiene su clave aquí.
    entry_id: e.execId,
    // Bybit no tiene dos identificadores como Coinbase (`entry_id` para la
    // fila y `trade_id` para la ejecución). Repetirlo es más honesto que
    // inventarse uno: dice «aquí hay un solo identificador».
    trade_id: e.execId,
    order_id: e.orderId,
    trade_time: cuando,
    // Todo lo que llega aquí ha pasado por `esUnaEjecucionDeVerdad`, así que
    // es una ejecución. `REVERSAL`/`CORRECTION` son conceptos de Coinbase: sus
    // correcciones llegan como filas nuevas, y Bybit no corrige ejecuciones
    // --las anula con otra ejecución--, así que marcar algo distinto de `FILL`
    // sería describir un mecanismo que no existe en esta fuente.
    trade_type: "FILL",
    price: e.execPrice,
    size: e.execQty,
    commission: e.execFee,
    product_id: e.symbol,
    // De aquí sale la marca de agua de la sincronización. Es la misma hora que
    // `trade_time` porque Bybit sólo da una: no tiene el par
    // ejecución/secuencia de Coinbase.
    sequence_timestamp: cuando,
    liquidity_indicator: e.isMaker === undefined ? "UNKNOWN_LIQUIDITY_INDICATOR" : e.isMaker ? "MAKER" : "TAKER",
    side: e.side === "Buy" ? "BUY" : "SELL",
  };
}

function aOrdenDeCoinbase(o: BybitOrder): CoinbaseOrder {
  return {
    order_id: o.orderId,
    product_id: o.symbol,
    side: o.side === "Buy" ? "BUY" : "SELL",
    status: aEstadoDeCoinbase(o.orderStatus),
    order_type: o.orderType,
    // Esto es lo que hace que la insignia «Liquidada» funcione también en
    // Bybit: `refresh_trade_liquidations` cuenta los contratos de salida cuya
    // orden fue una liquidación, y lo sabe por aquí.
    is_liquidation: laLiquidoBybit(o.createType),
    created_time: o.createdTime ? new Date(Number(o.createdTime)).toISOString() : undefined,
  };
}

/**
 * El estado de una orden de Bybit dicho en los seis valores que usa la
 * aplicación.
 *
 * Se traduce y no se pasa la cadena tal cual porque `raw_orders.status` la leen
 * las consultas de conciliación comparándola con estos valores: dejar entrar
 * «PartiallyFilledCanceled» convertiría esas comparaciones en falsos siempre,
 * y un `switch` que no case con nada es más difícil de ver que un valor raro en
 * una columna.
 *
 * Los cuatro estados de Bybit que significan «ya no está viva y no se llenó»
 * --rechazada, cancelada, desactivada, cancelada a medias-- caen en
 * `CANCELLED`: la aplicación no distingue por qué murió una orden, sólo si
 * llegó a ejecutarse, y las ejecuciones vienen por su propia lista.
 */
function aEstadoDeCoinbase(estado: string): CoinbaseOrder["status"] {
  switch (estado) {
    case "Filled":
      return "FILLED";
    case "New":
    case "PartiallyFilled":
    case "Untriggered":
    case "Triggered":
      return "OPEN";
    case "Cancelled":
    case "PartiallyFilledCanceled":
    case "Deactivated":
      return "CANCELLED";
    case "Rejected":
      return "FAILED";
    default:
      // Y no «OPEN», que es el valor que haría que una orden desconocida
      // pareciera estar viva para siempre.
      return "UNKNOWN_ORDER_STATUS";
  }
}

/**
 * Si la orden la creó Bybit para cerrarte, no tú.
 *
 * `createType` viene con los perpetuos: `CreateByLiq` es liquidación y
 * `CreateByAdminClosing` / `CreateByPartialTakeProfit`-y-compañía no lo son.
 * `CreateByAdl` es reducción automática por riesgo del seguro, que a efectos
 * del diario cuenta igual: no lo decidiste tú.
 *
 * En `spot` no existe el campo y la respuesta es siempre `false`, que es
 * correcto: en spot no te liquidan.
 */
function laLiquidoBybit(createType: string | undefined): boolean {
  return createType === "CreateByLiq" || createType === "CreateByAdl";
}

function aProductoDeCoinbase(i: BybitInstrument, category: BybitCategory): CoinbaseProduct {
  const esPerpetuo = category !== "spot";

  return {
    product_id: i.symbol,
    // `EXTERNAL` es un valor que la tabla `products` ya aceptaba: este
    // instrumento no es de ningún venue de Coinbase y decir «FCM» sería
    // mentir en una columna que sirve para saber de dónde salió un precio.
    product_venue: "EXTERNAL",
    product_type: esPerpetuo ? "FUTURE" : "SPOT",
    base_currency_id: i.baseCoin,
    quote_currency_id: i.quoteCoin,
    display_name: i.symbol,
    future_product_details: esPerpetuo
      ? {
          // Uno. En los perpetuos de Bybit un contrato es una unidad de la
          // moneda base, así que no hay multiplicador que aplicar -- y es lo
          // que hace que el motor de P&L, escrito para futuros con
          // multiplicador, valga aquí sin tocarlo.
          contract_size: "1",
          contract_root_unit: i.baseCoin,
          contract_expiry_type: "PERPETUAL",
        }
      : undefined,
  };
}
