/**
 * Un titular: lo que pasa sin avisar y mueve el precio igual.
 *
 * El calendario económico sabe de lo programado -- el IPC sale el día 12 a
 * las 12:30 desde hace décadas -- y eso deja fuera media realidad. Una moción
 * de cierre que fracasa en el Senado, un hackeo, un ETF aprobado: nada de eso
 * está en una agenda, y el 15 de septiembre de 2026 la aplicación no dijo
 * absolutamente nada mientras Bitcoin caía un 2,6 %.
 *
 * La interfaz está aquí y la fuente aparte, igual que en el calendario y por
 * el mismo motivo: la fuente es reemplazable y la pantalla no debe saber cuál
 * es.
 */

export interface MarketNewsItem {
  /** El identificador que le da la fuente; con `source`, la clave de idempotencia. */
  sourceNewsId: string;
  publishedAt: Date;
  title: string;
  provider: string | null;
  url: string | null;
  /** La ruta de la fuente para pedir el cuerpo. No se guarda: sólo sirve al traerlo. */
  storyId: string | null;
  symbols: string[];
}

export interface MarketNewsPort {
  /**
   * Los titulares más recientes, del más nuevo al más viejo.
   *
   * `cursor` es opaco a propósito: cada fuente pagina como quiere y el
   * sincronizador sólo tiene que saber devolverlo para pedir la página
   * siguiente.
   */
  fetchLatest(params: { cursor?: string | null }): Promise<{
    items: MarketNewsItem[];
    cursor: string | null;
  }>;

  /** El resumen de un titular, o null si la fuente no lo da. */
  fetchSummary(storyId: string): Promise<string | null>;
}
