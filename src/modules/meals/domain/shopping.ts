/**
 * La lista de la compra, en el súper.
 *
 * La lista ya sumaba cantidades por unidad -- que es lo que Notion no sabía
 * hacer -- pero se quedaba justo antes del momento en que se usa: dentro de la
 * tienda. Era de sólo lectura, así que había que ir recordando por dónde ibas,
 * y sólo contenía ingredientes de comidas planificadas, así que para el papel,
 * el café y el jabón hacía falta además otra lista -- y dos listas es lo mismo
 * que ninguna.
 *
 * Tres cosas: marcar lo comprado, añadir lo que no viene de ninguna comida, y
 * agruparlo por zona de la tienda. Una lista alfabética hace cruzar el
 * supermercado seis veces; agrupada se recorre una vez.
 *
 * Puro.
 */

export type Aisle = "FRESCO" | "NEVERA" | "DESPENSA" | "BEBIDA" | "LIMPIEZA" | "OTROS";

export const AISLE_LABELS: Record<Aisle, string> = {
  FRESCO: "Fresco",
  NEVERA: "Nevera y congelados",
  DESPENSA: "Despensa",
  BEBIDA: "Bebidas",
  LIMPIEZA: "Limpieza y hogar",
  OTROS: "Lo demás",
};

/** El orden en que se recorre una tienda: fresco al principio, hogar al final. */
export const AISLE_ORDER: Aisle[] = ["FRESCO", "NEVERA", "DESPENSA", "BEBIDA", "LIMPIEZA", "OTROS"];

/**
 * Palabras que delatan la zona, por zona.
 *
 * Deliberadamente cortas y en singular: se comparan contra el nombre ya
 * normalizado --sin acentos, sin plural-- y una lista larga de casos raros es
 * una lista que nadie mantiene. Lo que no encaje cae en «lo demás», que es
 * honesto: mejor una categoría vacía de significado que una equivocada, porque
 * lo segundo hace dar una vuelta de más buscando donde no está.
 */
const PISTAS: Record<Exclude<Aisle, "OTROS">, string[]> = {
  FRESCO: [
    "tomate", "lechuga", "cebolla", "ajo", "patata", "papa", "zanahoria", "pimiento",
    "calabacin", "berenjena", "pepino", "brocoli", "espinaca", "champinon", "seta",
    "manzana", "platano", "banana", "naranja", "limon", "lima", "fresa", "aguacate",
    "pera", "uva", "mango", "piña", "melon", "sandia", "kiwi", "apio", "puerro",
    "perejil", "cilantro", "albahaca", "jengibre", "pollo", "ternera", "cerdo",
    "carne", "pescado", "salmon", "atun", "gamba", "merluza", "lomo", "pechuga",
  ],
  NEVERA: [
    "leche", "yogur", "queso", "mantequilla", "nata", "huevo", "jamon", "bacon",
    "chorizo", "salchicha", "tofu", "hummus", "congelado", "helado", "guisante",
  ],
  DESPENSA: [
    "arroz", "pasta", "espagueti", "macarron", "harina", "azucar", "sal", "aceite",
    "vinagre", "lenteja", "garbanzo", "alubia", "frijol", "judia", "atun en lata",
    "tomate frito", "caldo", "especia", "pimienta", "comino", "oregano", "canela",
    "pan", "galleta", "cereal", "avena", "miel", "chocolate", "cafe", "te", "nuez",
    "almendra", "cacahuete", "levadura", "maiz", "quinoa", "cuscus", "salsa",
  ],
  BEBIDA: ["agua", "zumo", "refresco", "cerveza", "vino", "gaseosa", "bebida"],
  LIMPIEZA: [
    "papel", "servilleta", "detergente", "jabon", "lavavajilla", "suavizante",
    "lejia", "bolsa", "esponja", "friega", "champu", "pasta de diente", "basura",
  ],
};

/**
 * Quita acentos, mayúsculas y el plural simple.
 *
 * La misma regla que ya usa el agrupador de ingredientes, y por el mismo
 * motivo: sólo se quita una «s» final. Aplicar la otra regla del plural
 * español --«es» tras consonante-- a ciegas convierte «tomates» en «tomat» y
 * deja de casar con nada.
 */
export function normaliseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/s$/, "");
}

/**
 * En qué zona de la tienda cae un ingrediente.
 *
 * Gana la pista **más larga** que aparezca, no la primera que se encuentre:
 * «tomate frito» está en despensa y «tomate» en fresco, y buscando por orden
 * de zona el bote de tomate frito acabaría en la sección de verdura.
 */
export function guessAisle(name: string): Aisle {
  const limpio = normaliseName(name);
  let mejor: { aisle: Aisle; largo: number } | null = null;

  for (const aisle of AISLE_ORDER) {
    if (aisle === "OTROS") continue;
    for (const pista of PISTAS[aisle]) {
      if (!limpio.includes(pista)) continue;
      if (mejor === null || pista.length > mejor.largo) {
        mejor = { aisle, largo: pista.length };
      }
    }
  }

  return mejor?.aisle ?? "OTROS";
}

export interface ShoppingLine {
  /** Estable entre recargas: es lo que ata el «comprado» a la línea. */
  key: string;
  name: string;
  amount: string;
  aisle: Aisle;
  /** True si lo añadiste a mano y no viene de ninguna comida. */
  extra: boolean;
}

export interface AisleGroup {
  aisle: Aisle;
  label: string;
  lines: ShoppingLine[];
}

/**
 * Las líneas repartidas por zona, en el orden en que se recorre una tienda.
 *
 * Las zonas vacías no salen: un encabezado sin nada debajo es ruido en una
 * pantalla que se mira con una mano y el carro en la otra.
 */
export function groupByAisle(lines: ShoppingLine[]): AisleGroup[] {
  return AISLE_ORDER.map((aisle) => ({
    aisle,
    label: AISLE_LABELS[aisle],
    lines: lines.filter((l) => l.aisle === aisle),
  })).filter((g) => g.lines.length > 0);
}

/** La lista como texto plano, para mandarla por mensaje. */
export function toPlainText(groups: AisleGroup[], comprados: Set<string>): string {
  const trozos: string[] = [];

  for (const grupo of groups) {
    const pendientes = grupo.lines.filter((l) => !comprados.has(l.key));
    // Lo ya comprado no se manda: quien recibe la lista quiere saber qué
    // falta, no qué había.
    if (pendientes.length === 0) continue;

    trozos.push(grupo.label.toUpperCase());
    for (const linea of pendientes) {
      trozos.push(linea.amount ? `- ${linea.name} (${linea.amount})` : `- ${linea.name}`);
    }
    trozos.push("");
  }

  return trozos.join("\n").trim();
}
