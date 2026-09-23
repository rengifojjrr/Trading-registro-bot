import "server-only";

import { BybitDemoAdapter } from "@/lib/bybit/adapter";
import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { IntxAdapter } from "@/lib/coinbase/venues/intx";
import type { MarketDataPort } from "@/lib/coinbase/ports";
import { serverEnv } from "@/lib/env";
import type { AccountConnector } from "@/types/database";

import { parseProductIds } from "./product-ids";

/**
 * Qué adaptador y qué símbolos le tocan a una cuenta.
 *
 * Estaba escrito tres veces --el orquestador, la conciliación y la ruta de
 * probar conexión-- y las tres decidían igual: por la variable de entorno
 * `COINBASE_PRODUCT_VENUE`, global. Con un único venue eso funcionaba; con dos
 * significaría que la cuenta de Coinbase y la de Bybit se sincronizan con el
 * mismo adaptador, el que diga la variable, y una de las dos contra el servicio
 * equivocado.
 *
 * Lo decide `accounts.connector` porque es la propiedad de la cuenta que
 * contesta la pregunta. Deducirlo de lo que la cuenta *no* es --«no es de
 * demostración, luego es de Coinbase»-- es lo que tenía el cron y lo que habría
 * puesto a pedirle a Coinbase los fills de cuatro cuentas importadas de Notion.
 */

export interface LoQueHaceFalta {
  adapter: MarketDataPort;
  /** Los símbolos a sincronizar, en el idioma de ese venue. */
  productIds: string[];
}

/**
 * Lo que falta para poder sincronizar una cuenta, dicho para que se pueda
 * arreglar.
 *
 * Un error y no un `null`: quien llama a esto está a punto de sincronizar, y
 * «no se pudo» sin decir qué falta es un cron que consta como fallido cada
 * cinco minutos sin explicar por qué. El mensaje nombra la variable que hay
 * que poner.
 */
export class CuentaSinConfigurar extends Error {
  constructor(
    readonly connector: AccountConnector,
    queFalta: string,
  ) {
    super(`No se puede sincronizar una cuenta ${connector}: ${queFalta}`);
    this.name = "CuentaSinConfigurar";
  }
}

export function adaptadorDeLaCuenta(connector: AccountConnector): LoQueHaceFalta {
  const env = serverEnv();

  if (connector === "BYBIT_DEMO") {
    const productIds = parseProductIds(env.BYBIT_SYMBOLS);

    if (!env.BYBIT_DEMO_API_KEY || !env.BYBIT_DEMO_API_SECRET) {
      throw new CuentaSinConfigurar(
        connector,
        "faltan BYBIT_DEMO_API_KEY y/o BYBIT_DEMO_API_SECRET. Se crean en la cuenta demo de Bybit, no en la de dinero real: entra en Bybit, cambia a «Demo Trading» --que es un usuario aparte-- y saca las claves desde ahí.",
      );
    }
    if (productIds.length === 0) {
      throw new CuentaSinConfigurar(
        connector,
        "falta BYBIT_SYMBOLS, separados por comas. Por ejemplo «BTCUSDT» o «BTCUSDT,ETHUSDT».",
      );
    }

    return {
      adapter: new BybitDemoAdapter({
        apiKey: env.BYBIT_DEMO_API_KEY,
        apiSecret: env.BYBIT_DEMO_API_SECRET,
        category: env.BYBIT_CATEGORY,
      }),
      productIds,
    };
  }

  if (connector === "COINBASE") {
    const productIds = parseProductIds(env.COINBASE_PRODUCT_ID);

    if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY) {
      throw new CuentaSinConfigurar(
        connector,
        "faltan COINBASE_CDP_API_KEY_NAME y/o COINBASE_CDP_PRIVATE_KEY -- ver .env.example.",
      );
    }
    if (productIds.length === 0) {
      throw new CuentaSinConfigurar(connector, "falta COINBASE_PRODUCT_ID -- ver .env.example.");
    }

    return {
      adapter:
        env.COINBASE_PRODUCT_VENUE === "INTX"
          ? new IntxAdapter()
          : new CfmAdapter({
              apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
              privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
            }),
      productIds,
    };
  }

  // `MANUAL` y `SEED`. Llegar aquí es un fallo de quien eligió las cuentas, no
  // una configuración que falte: no hay ninguna variable de entorno que haga
  // sincronizable una cuenta cuyos fills se escribieron a mano.
  throw new CuentaSinConfigurar(
    connector,
    connector === "SEED"
      ? "son los datos inventados del guion de siembra y no hay nada detrás que consultar."
      : "sus operaciones entraron por CSV, por Notion o a mano, así que no hay a quién pedirle más.",
  );
}

/** Si a esta cuenta se le puede pedir algo. Lo usa el cron para elegirlas. */
export const CONNECTORS_QUE_SE_SINCRONIZAN = ["COINBASE", "BYBIT_DEMO"] as const;
