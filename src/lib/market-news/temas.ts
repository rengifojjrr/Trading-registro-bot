/**
 * De qué va un titular, deducido de sus palabras.
 *
 * Hace falta porque la fuente no lo dice: TradingView manda un campo
 * `urgency` que en todos los titulares comprobados vale exactamente lo mismo,
 * así que no distingue nada. Y sin temas, una lista de veinticinco titulares
 * al día es una lista que se deja de leer a la semana.
 *
 * **Son reglas, no un modelo.** Casan palabras sobre el titular, en orden, y
 * cuando ninguna casa el titular se queda **sin tema** en vez de recibir uno
 * plausible. Un filtro por temas sólo sirve si los temas son ciertos: uno
 * inventado esconde justo lo que buscabas.
 *
 * El criterio para esta lista y no otra: son las familias de noticia que
 * históricamente mueven Bitcoin en minutos. Una noticia de producto de una
 * empresa cualquiera no entra, y por eso se queda sin tema.
 *
 * Puro: lo prueba `temas.test.ts`.
 */

export const TEMAS = [
  "REGULACION",
  "ETF",
  "MACRO",
  "SEGURIDAD",
  "TESORERIA",
  "ADOPCION",
  "MINERIA",
  "MERCADO",
] as const;

export type Tema = (typeof TEMAS)[number];

export const TEMA_LABELS: Record<Tema, string> = {
  REGULACION: "Regulación",
  ETF: "ETF",
  MACRO: "Macro",
  SEGURIDAD: "Seguridad",
  TESORERIA: "Tesorerías",
  ADOPCION: "Adopción",
  MINERIA: "Minería",
  MERCADO: "Mercado",
};

/** Qué significa cada tema, para poder decirlo en la pantalla sin adivinar. */
export const TEMA_DESCRIPCIONES: Record<Tema, string> = {
  REGULACION: "Leyes, tribunales y organismos. Lo que cambia las reglas del juego.",
  ETF: "Los fondos cotizados y sus entradas y salidas de dinero.",
  MACRO: "Tipos, inflación, empleo y deuda. El mismo terreno que el calendario, pero sin fecha previa.",
  SEGURIDAD: "Hackeos, robos y fallos. Suelen mover el precio en minutos y hacia abajo.",
  TESORERIA: "Empresas y estados que compran o venden. Dinero grande entrando o saliendo.",
  ADOPCION: "Países, bancos y plataformas que empiezan (o dejan) de usarlo.",
  MINERIA: "Mineros, dificultad y halving. El lado de la oferta.",
  MERCADO: "Liquidaciones, posiciones y derivados. Lo que hace el propio mercado.",
};

interface Regla {
  tema: Tema;
  /** Se comparan en minúsculas y sin tildes, así que van escritas así. */
  palabras: string[];
}

/**
 * Sin tildes y en minúsculas, para que «regulación» y «REGULACION» casen con
 * la misma regla. Se normaliza el titular, no las reglas, porque las reglas
 * ya están escritas así.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const REGLAS: Regla[] = [
  {
    tema: "REGULACION",
    palabras: [
      "sec", "cftc", "regulaci", "ley ", " ley", "senado", "congreso", "camara de representantes",
      "clarity", "mica", "demanda", "juez", "tribunal", "corte suprema", "prohib", "sancion",
      "normativa", "marco regulatorio", "legisla", "impuesto", "fiscal", "tributar", "licencia",
    ],
  },
  {
    tema: "ETF",
    palabras: ["etf", "fondo cotizado", "ishares", "grayscale", "blackrock", "flujos netos", "entradas netas", "salidas netas"],
  },
  {
    tema: "MACRO",
    palabras: [
      "reserva federal", "la fed", " fed ", "powell", "tipos de interes", "tasas de interes",
      "inflacion", "ipc", "empleo", "nominas", "pib", "recesion", "rendimiento a", "bonos del tesoro",
      "banco central", "bce", "dolar", "yen", "estimulo",
    ],
  },
  {
    tema: "SEGURIDAD",
    palabras: ["hacke", "hackers", "robo", "robaron", "exploit", "vulnerabilidad", "estafa", "phishing", "brecha", "ataque"],
  },
  {
    tema: "TESORERIA",
    palabras: [
      "microstrategy", "strategy compra", "tesoreria", "compro bitcoin", "compra bitcoin",
      "vendio bitcoin", "reserva estrategica", "ballena", "ballenas", "institucional",
    ],
  },
  {
    tema: "ADOPCION",
    palabras: ["adopcion", "acepta bitcoin", "pagos con", "banco lanza", "integra bitcoin", "curso legal", "el salvador"],
  },
  {
    tema: "MINERIA",
    palabras: ["mineria", "mineros", "hashrate", "tasa de hash", "halving", "dificultad de mineria"],
  },
  {
    tema: "MERCADO",
    palabras: [
      "liquidaci", "posiciones largas", "posiciones cortas", "interes abierto", "apalancamiento",
      "futuros", "opciones", "soporte", "resistencia", "maximo historico", "correccion", "crash",
    ],
  },
];

/**
 * Los temas de un titular, en el orden de las reglas.
 *
 * Puede tener varios: «El Senado no aprueba la Ley CLARITY» es regulación, y
 * «Acciones cripto caen antes de la votación del Clarity Act y la decisión de
 * la Fed» es regulación *y* macro. Forzar uno solo obligaría a elegir por el
 * usuario, y en un filtro eso es esconderle la mitad.
 */
export function temasDe(titulo: string): Tema[] {
  const texto = normalizar(titulo);
  const encontrados: Tema[] = [];

  for (const regla of REGLAS) {
    if (encontrados.includes(regla.tema)) continue;
    if (regla.palabras.some((palabra) => texto.includes(palabra))) encontrados.push(regla.tema);
  }

  return encontrados;
}

export function esTema(valor: string): valor is Tema {
  return (TEMAS as readonly string[]).includes(valor);
}

export function temaLabel(valor: string): string | null {
  return esTema(valor) ? TEMA_LABELS[valor] : null;
}
