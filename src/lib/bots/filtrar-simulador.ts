import type { FiltrosDeBots } from "@/components/bots/simulador-filtros";

/**
 * Filtrar y ordenar la tabla del simulador.
 *
 * Aparte del componente y sin nada de React a propósito: lo que decide qué
 * filas se ven es una regla, y una regla se prueba con una lista escrita a
 * mano. Dentro del componente habría que montar la tabla entera para
 * comprobar que «perdiendo» no incluye a los que van a cero.
 */

/** Lo que el filtro necesita saber de un bot. */
export interface BotFiltrable {
  nombre: string;
  familia: string | null;
  mercado: string;
  temporalidad: string;
  equity: number | null;
  pnl: number | null;
  encendido: boolean;
  operaciones: number;
  tienePosicion: boolean;
}

/** Ignora mayúsculas y acentos: nadie escribe «Intradía» con tilde en un buscador. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function coincideElTexto(bot: BotFiltrable, texto: string): boolean {
  const buscado = normalizar(texto.trim());
  if (buscado === "") return true;
  // El mercado y la temporalidad entran en la búsqueda porque «5m» y «ETH»
  // son lo que uno teclea cuando busca «los de cinco minutos».
  return normalizar(`${bot.nombre} ${bot.mercado} ${bot.temporalidad}`).includes(buscado);
}

function coincideElResultado(bot: BotFiltrable, filtros: FiltrosDeBots): boolean {
  switch (filtros.resultado) {
    case "GANANDO":
      return bot.pnl !== null && bot.pnl > 0;
    case "PERDIENDO":
      // Estrictamente menor que cero: un bot que no ha operado está en cero y
      // no está perdiendo, está esperando. Meterlo aquí haría que «perdiendo»
      // contestara otra pregunta.
      return bot.pnl !== null && bot.pnl < 0;
    case "EN_MERCADO":
      return bot.tienePosicion;
    default:
      return true;
  }
}

/** El valor por el que ordenar, ya en negativo para que mayor salga primero. */
function clave(bot: BotFiltrable, orden: FiltrosDeBots["orden"]): number {
  switch (orden) {
    case "PNL":
      return -(bot.pnl ?? 0);
    case "PATRIMONIO":
      return -(bot.equity ?? 0);
    case "OPERACIONES":
      return -bot.operaciones;
    default:
      return 0;
  }
}

export function filtrarBots<T extends BotFiltrable>(bots: T[], filtros: FiltrosDeBots): T[] {
  const visibles = bots.filter(
    (bot) =>
      coincideElTexto(bot, filtros.texto) &&
      (filtros.familia === "TODAS" || bot.familia === filtros.familia) &&
      (filtros.estado === "TODOS" ||
        (filtros.estado === "ENCENDIDOS" ? bot.encendido : !bot.encendido)) &&
      coincideElResultado(bot, filtros),
  );

  // Por nombre siempre como desempate, incluso ordenando por P&L: sin él, dos
  // bots con el mismo resultado cambian de sitio entre recargas y la tabla
  // parece moverse sola.
  return [...visibles].sort(
    (a, b) =>
      clave(a, filtros.orden) - clave(b, filtros.orden) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** Las familias que de verdad hay, para no ofrecer un filtro que no filtra nada. */
export function familiasPresentes<T extends BotFiltrable>(
  bots: T[],
  etiqueta: (familia: string) => string,
): { valor: string; texto: string }[] {
  const vistas = [...new Set(bots.map((b) => b.familia).filter((f): f is string => f !== null))];
  return vistas
    .map((valor) => ({ valor, texto: etiqueta(valor) }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
}
