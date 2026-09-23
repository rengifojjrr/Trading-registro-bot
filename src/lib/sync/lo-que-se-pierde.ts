import type { AccountConnector } from "@/types/database";

/**
 * Cuánto queda antes de que una sincronización caída pase de molestia a
 * pérdida.
 *
 * Con Coinbase, una sincronización que lleva cuatro días rota es un fastidio:
 * en cuanto se arregle, se pide el hueco y aparece todo. Coinbase guarda dos
 * años de histórico.
 *
 * Con la cuenta demo de Bybit no. **Borra a los siete días.** Una
 * sincronización que se rompa un viernes y se arregle el viernes siguiente no
 * recupera la semana: esas operaciones ya no existen en ninguna parte, porque
 * el diario era el único registro durable que tenían.
 *
 * Eso convierte un aviso de «la sincronización falla» en dos avisos distintos
 * según de qué cuenta hable, y el de Bybit tiene que decir lo que se está
 * jugando y cuánto queda. Un aviso que no distingue enseña a ignorarlo, y el
 * día que importe estará igual de ignorado.
 */

/**
 * Cuánto guarda cada fuente antes de olvidar. `null` es «lo suficiente como
 * para que no sea el problema».
 */
const DIAS_QUE_GUARDA: Record<AccountConnector, number | null> = {
  // Documentado por Bybit: «Orders generated in demo trading keep 7 days».
  BYBIT_DEMO: 7,
  // Dos años en el histórico de ejecuciones.
  COINBASE: null,
  // No se sincronizan, así que no hay nada que perder por no sincronizar.
  MANUAL: null,
  SEED: null,
};

/**
 * A partir de cuándo avisar de que corre el reloj.
 *
 * Dos días antes del borrado. Avisar al quinto día y no al sexto deja margen
 * para leer el correo un lunes cuando se rompió el sábado; avisar al primero
 * convertiría en urgente algo que casi siempre se arregla solo en el ciclo
 * siguiente.
 */
const MARGEN_DE_AVISO_DIAS = 2;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export interface CuentaAtras {
  /** Días enteros que la sincronización lleva sin funcionar. */
  diasCaida: number;
  /** Días que quedan antes de que la fuente empiece a borrar. `null` si no borra. */
  diasHastaPerder: number | null;
  /** Si ya se está perdiendo algo ahora mismo. */
  perdiendoYa: boolean;
  /**
   * La frase que se añade al aviso, o `null` si no hay nada que añadir. Dice
   * qué se pierde y cuándo, que es lo único que hace accionable un aviso.
   */
  advertencia: string | null;
}

export function loQueSePierde(params: {
  connector: AccountConnector;
  /** `sync_state.last_success_at`. Null cuando nunca funcionó. */
  ultimoExito: string | null;
  desde: string | null;
  ahora?: Date;
}): CuentaAtras {
  const ahora = params.ahora ?? new Date();
  const guarda = DIAS_QUE_GUARDA[params.connector];

  // Sin un éxito previo se cuenta desde que la cuenta empezó a intentarlo. Y
  // si tampoco hay eso, no se puede afirmar nada: cero, y sin advertencia.
  const referencia = params.ultimoExito ?? params.desde;
  const inicio = referencia ? Date.parse(referencia) : Number.NaN;

  if (!Number.isFinite(inicio)) {
    return { diasCaida: 0, diasHastaPerder: guarda, perdiendoYa: false, advertencia: null };
  }

  const diasCaida = Math.max(0, Math.floor((ahora.getTime() - inicio) / UN_DIA_MS));

  if (guarda === null) {
    return { diasCaida, diasHastaPerder: null, perdiendoYa: false, advertencia: null };
  }

  const diasHastaPerder = guarda - diasCaida;
  const perdiendoYa = diasHastaPerder <= 0;

  if (perdiendoYa) {
    return {
      diasCaida,
      diasHastaPerder,
      perdiendoYa: true,
      advertencia:
        `YA SE ESTÁN PERDIENDO OPERACIONES. La cuenta demo de Bybit sólo guarda ${guarda} días ` +
        `y la sincronización lleva ${diasCaida} sin funcionar, así que lo que operaste hace más ` +
        `de ${guarda} días ya no existe ni en Bybit ni aquí. Arreglar esto ahora salva lo que ` +
        `quede; lo de antes no se puede recuperar.`,
    };
  }

  if (diasHastaPerder <= MARGEN_DE_AVISO_DIAS) {
    return {
      diasCaida,
      diasHastaPerder,
      perdiendoYa: false,
      advertencia:
        `Quedan ${diasHastaPerder} día(s) antes de perder operaciones para siempre. La cuenta ` +
        `demo de Bybit sólo guarda ${guarda} días de histórico, así que este diario es su único ` +
        `registro durable: lo que no se sincronice antes de ese plazo no se podrá recuperar.`,
    };
  }

  return { diasCaida, diasHastaPerder, perdiendoYa: false, advertencia: null };
}

/** Cómo se llama esta fuente cuando hay que nombrarla en un aviso. */
export function nombreDelConector(connector: AccountConnector): string {
  switch (connector) {
    case "COINBASE":
      return "Coinbase";
    case "BYBIT_DEMO":
      return "Bybit (cuenta demo)";
    case "MANUAL":
      return "importación manual";
    case "SEED":
      return "datos de demostración";
  }
}
