/**
 * Qué mide cada dato y cómo se suele leer un resultado.
 *
 * La fuente trae una explicación (`comment`), pero está en inglés y es
 * descriptiva: dice qué mide el índice, no qué significa que salga alto. Esto
 * es lo segundo, escrito a mano y en español, para los datos que de verdad se
 * miran operando Bitcoin.
 *
 * **Lo que esto es y lo que no.** Es el mecanismo de transmisión que enseña
 * cualquier manual: un dato de inflación alto empuja a la Reserva Federal a
 * mantener los tipos altos, y los tipos altos restan apetito por activos de
 * riesgo. Eso es enseñable y comprobable. Lo que **no** es: una predicción del
 * precio. El mercado hace lo contrario a menudo, sobre todo cuando ya venía
 * descontando el dato -- por eso la pantalla lo enseña siempre junto a lo que
 * de hecho pasó las últimas veces, medido sobre velas reales.
 *
 * Sólo hay ficha para lo que se conoce bien. Un indicador que no esté aquí
 * enseña lo que mide según la fuente y no se inventa la interpretación: es
 * preferible callar a improvisar una explicación macro plausible.
 */

/**
 * Hacia dónde empuja, según la lectura habitual, **el precio de Bitcoin**.
 *
 * Está aparte del texto y no dentro de él porque el texto explica el
 * mecanismo --tipos, consumo, empleo-- y hay que leerlo entero para deducir
 * de qué lado cae. Con una posición abierta eso no se hace: lo que hace falta
 * saber en tres segundos es si el escenario que acaba de ocurrir es el bueno
 * o el malo para lo que tienes puesto.
 *
 * `MIXTO` no es un «no lo sé» ni una forma de escurrir el bulto: es el caso
 * real de los datos de crecimiento y empleo, donde la economía fuerte es
 * buena por un lado (crecimiento) y mala por otro (aleja las bajadas de
 * tipos), y cuál de las dos manda depende del momento del ciclo. Donde se usa,
 * el texto de al lado explica las dos lecturas.
 */
export type SesgoParaBitcoin = "ALCISTA" | "BAJISTA" | "MIXTO";

/**
 * Cómo se dice cada sesgo.
 *
 * «Suele leerse» y no «es»: esto es la lectura de manual, no una predicción.
 * El mercado hace lo contrario a menudo, sobre todo cuando ya venía
 * descontando el dato, y por eso la misma pantalla lo enseña junto a lo que de
 * hecho pasó las últimas veces.
 */
export const SESGO_LABELS: Record<SesgoParaBitcoin, string> = {
  ALCISTA: "Suele leerse como alcista para Bitcoin",
  BAJISTA: "Suele leerse como bajista para Bitcoin",
  MIXTO: "Tiene dos lecturas opuestas",
};

export interface IndicatorGuide {
  /** Qué mide, en dos frases como mucho. */
  mide: string;
  /** Cómo se suele leer un dato por encima de lo previsto. */
  porEncima: string;
  /** Y de qué lado cae eso para Bitcoin. */
  sesgoEncima: SesgoParaBitcoin;
  /** Y por debajo. */
  porDebajo: string;
  sesgoDebajo: SesgoParaBitcoin;
  /** Cuando el dato tiene una particularidad que cambia cómo se lee. */
  nota?: string;
}

/**
 * Reglas en orden: gana la primera que encaje, así que lo específico va antes
 * que lo general. Se comparan en minúsculas contra `indicator` y `title`
 * juntos, para aguantar que la fuente cambie el nombre corto.
 */
interface Regla {
  match: string[];
  guide: IndicatorGuide;
}

const INFLACION_AL_ALZA =
  "Se lee como que la inflación no cede. Eso empuja a la Reserva Federal a mantener los tipos altos más tiempo, y el dinero caro suele restar apetito por los activos de riesgo -- Bitcoin entre ellos.";
const INFLACION_A_LA_BAJA =
  "Se lee como que la inflación cede, lo que da margen a la Reserva Federal para bajar tipos antes. Suele leerse como favorable para los activos de riesgo.";

const REGLAS: Regla[] = [
  // -- La Reserva Federal, lo que más pesa de todo --------------------------
  {
    match: ["fed press conference", "rueda de prensa"],
    guide: {
      mide:
        "La comparecencia del presidente de la Reserva Federal media hora después de la decisión de tipos. No trae un número: trae el tono con el que explican la decisión y lo que insinúan sobre las siguientes.",
      porEncima:
        "No hay dato que comparar. Un tono más duro de lo esperado -- preocupación por la inflación, prisa por no bajar tipos -- suele pesar sobre los activos de riesgo.",
      sesgoEncima: "BAJISTA",
      porDebajo:
        "Un tono más blando -- confianza en que la inflación cede, puerta abierta a bajar tipos -- suele leerse como favorable.",
      sesgoDebajo: "ALCISTA",
      nota: "Históricamente mueve más el precio que la propia decisión, porque la decisión suele estar descontada y el tono no.",
    },
  },
  {
    match: ["fomc minutes", "actas"],
    guide: {
      mide:
        "Las actas de la reunión anterior de la Reserva Federal, publicadas tres semanas después. Detallan el debate interno: quién quería qué y con qué argumentos.",
      porEncima:
        "No hay dato que comparar. Unas actas más duras de lo que dio a entender la reunión suelen pesar sobre los activos de riesgo.",
      sesgoEncima: "BAJISTA",
      porDebajo: "Unas actas más blandas suelen leerse como favorables.",
      sesgoDebajo: "ALCISTA",
      nota: "Son de una reunión ya pasada, así que sólo mueven el precio cuando revelan algo que no se supo entonces.",
    },
  },
  {
    match: ["fomc economic projections", "proyecciones"],
    guide: {
      mide:
        "El cuadro de previsiones de los miembros de la Reserva Federal: dónde ven los tipos, la inflación, el paro y el crecimiento en los próximos años. Se publica cuatro veces al año.",
      porEncima:
        "Un cuadro que apunta a tipos más altos de lo que el mercado esperaba suele pesar sobre los activos de riesgo.",
      sesgoEncima: "BAJISTA",
      porDebajo: "Uno que apunta a más recortes de tipos suele leerse como favorable.",
      sesgoDebajo: "ALCISTA",
      nota: "Lo que más se mira es el «diagrama de puntos», donde cada miembro marca dónde ve los tipos.",
    },
  },
  {
    match: ["fed interest rate", "interest rate decision", "decisión de tipos"],
    guide: {
      mide:
        "El tipo de interés oficial de Estados Unidos, que fija la Reserva Federal ocho veces al año. Es el precio del dinero, y de él cuelga la valoración de casi todo lo demás.",
      porEncima:
        "Tipos más altos de lo previsto encarecen el dinero y restan atractivo a lo que no paga intereses. Suele pesar sobre los activos de riesgo, Bitcoin incluido.",
      sesgoEncima: "BAJISTA",
      porDebajo:
        "Tipos más bajos de lo previsto abaratan el dinero y suelen leerse como favorables para los activos de riesgo.",
      sesgoDebajo: "ALCISTA",
      nota: "La decisión en sí casi siempre está descontada. Lo que mueve el precio suele ser el comunicado y la rueda de prensa de después.",
    },
  },

  // -- Inflación ------------------------------------------------------------
  {
    match: ["core inflation", "inflación subyacente"],
    guide: {
      mide:
        "La subida de precios al consumo dejando fuera alimentos y energía, que son los dos componentes que más saltan de un mes a otro. Por eso la Reserva Federal mira más esta que la general.",
      porEncima: INFLACION_AL_ALZA,
      sesgoEncima: "BAJISTA",
      porDebajo: INFLACION_A_LA_BAJA,
      sesgoDebajo: "ALCISTA",
      nota: "Al excluir lo más volátil, una sorpresa aquí pesa más que la misma sorpresa en el dato general.",
    },
  },
  {
    match: ["inflation rate", "consumer price index", "cpi"],
    guide: {
      mide:
        "El IPC: cuánto suben los precios que paga el consumidor. Es el dato de inflación que más mira el mercado y el que marca el ritmo de la Reserva Federal.",
      porEncima: INFLACION_AL_ALZA,
      sesgoEncima: "BAJISTA",
      porDebajo: INFLACION_A_LA_BAJA,
      sesgoDebajo: "ALCISTA",
      nota: "Es de los que más movimiento genera en el minuto de la publicación.",
    },
  },
  {
    match: ["pce price"],
    guide: {
      mide:
        "El índice de precios del gasto en consumo personal. Es la medida de inflación que la Reserva Federal usa oficialmente para su objetivo del 2 %, aunque el mercado reacciona más al IPC.",
      porEncima: INFLACION_AL_ALZA,
      sesgoEncima: "BAJISTA",
      porDebajo: INFLACION_A_LA_BAJA,
      sesgoDebajo: "ALCISTA",
      nota: "Sale semanas después del IPC, así que buena parte ya viene anticipada y suele mover menos.",
    },
  },
  {
    match: ["core producer prices", "producer price"],
    guide: {
      mide:
        "Los precios que cobran los productores, antes de llegar a la tienda. Se mira como anticipo de la inflación al consumo: lo que sube aquí suele acabar subiendo allí.",
      porEncima: INFLACION_AL_ALZA,
      sesgoEncima: "BAJISTA",
      porDebajo: INFLACION_A_LA_BAJA,
      sesgoDebajo: "ALCISTA",
      nota: "Mueve menos que el IPC, pero cuando sorprende fuerte cambia lo que el mercado espera del IPC del mes siguiente.",
    },
  },

  // -- Empleo ---------------------------------------------------------------
  {
    match: ["non farm payrolls", "nonfarm payrolls"],
    guide: {
      mide:
        "Cuántos empleos se crearon en el mes fuera del campo. Es el termómetro de la economía estadounidense y, junto al IPC, el dato que más mueve los mercados.",
      porEncima:
        "Más empleo del previsto significa economía fuerte. Tiene dos lecturas opuestas y por eso es traicionero: es bueno para el crecimiento, pero reduce la urgencia de la Reserva Federal por bajar tipos. Cuál de las dos manda depende del momento del ciclo.",
      sesgoEncima: "MIXTO",
      porDebajo:
        "Menos empleo del previsto apunta a enfriamiento. Suele adelantar las bajadas de tipos, aunque un dato muy malo enciende el miedo a recesión y entonces cae todo.",
      sesgoDebajo: "MIXTO",
      nota: "Sale a la vez que la tasa de paro y el salario medio; el mercado los lee juntos, no por separado.",
    },
  },
  {
    match: ["unemployment rate", "tasa de paro"],
    guide: {
      mide: "El porcentaje de la población activa que busca empleo y no lo encuentra.",
      porEncima:
        "Más paro del previsto apunta a economía débil. Suele adelantar bajadas de tipos, pero si el salto es grande enciende el miedo a recesión.",
      sesgoEncima: "MIXTO",
      porDebajo: "Menos paro del previsto refuerza la idea de economía fuerte y resta urgencia a bajar tipos.",
      sesgoDebajo: "BAJISTA",
    },
  },
  {
    match: ["initial jobless claims", "peticiones de subsidio"],
    guide: {
      mide:
        "Cuántas personas pidieron el subsidio de desempleo por primera vez la semana pasada. Es el dato de empleo más frecuente y el que antes se entera de un giro.",
      porEncima:
        "Más peticiones de las previstas apuntan a un mercado laboral que se enfría, lo que acerca las bajadas de tipos.",
      sesgoEncima: "ALCISTA",
      porDebajo:
        "Menos peticiones apuntan a un mercado laboral que aguanta fuerte, lo que las aleja.",
      sesgoDebajo: "BAJISTA",
      nota: "Es semanal y ruidoso: una semana suelta dice poco, la tendencia de un mes dice mucho. Rara vez mueve el precio por sí solo.",
    },
  },
  {
    match: ["jolts"],
    guide: {
      mide:
        "Cuántas vacantes sin cubrir hay en Estados Unidos. Mide la demanda de trabajadores por parte de las empresas.",
      porEncima: "Más vacantes de las previstas indican un mercado laboral tenso, que presiona los salarios al alza.",
      sesgoEncima: "BAJISTA",
      porDebajo:
        "Menos vacantes indican que la demanda de trabajo se enfría, lo que quita presión a los salarios y acerca las bajadas de tipos.",
      sesgoDebajo: "ALCISTA",
      nota: "Los datos van con casi dos meses de retraso, así que confirman más de lo que anticipan.",
    },
  },

  // -- Crecimiento y consumo -------------------------------------------------
  {
    match: ["gdp growth", "pib"],
    guide: {
      mide: "Cuánto creció la economía estadounidense en el trimestre, en tasa anualizada.",
      porEncima:
        "Más crecimiento del previsto es bueno para la economía, pero reduce la urgencia de bajar tipos. La misma tensión que en el dato de empleo.",
      sesgoEncima: "MIXTO",
      porDebajo: "Menos crecimiento adelanta las bajadas de tipos, salvo que sea tan malo que asuste.",
      sesgoDebajo: "MIXTO",
      nota: "Se publica en tres versiones del mismo trimestre (avance, segunda y final); la primera es la que mueve.",
    },
  },
  {
    match: ["retail sales"],
    guide: {
      mide:
        "Cuánto gastaron los consumidores en tiendas. El consumo es aproximadamente dos tercios de la economía estadounidense, así que este dato pesa.",
      porEncima: "Más consumo del previsto indica una economía que aguanta y resta urgencia a bajar tipos.",
      sesgoEncima: "BAJISTA",
      porDebajo: "Menos consumo apunta a enfriamiento y suele adelantar las bajadas de tipos.",
      sesgoDebajo: "ALCISTA",
    },
  },
  {
    match: ["ism manufacturing", "ism services", "manufacturing pmi", "services pmi", "composite pmi"],
    guide: {
      mide:
        "Una encuesta a directores de compras sobre cómo ven su negocio. Por encima de 50 el sector se expande; por debajo, se contrae. Se publica antes que los datos oficiales, así que se usa como anticipo.",
      porEncima:
        "Una lectura mejor de lo previsto apunta a una economía más fuerte de lo que se creía, lo que resta urgencia a la Reserva Federal para bajar tipos.",
      sesgoEncima: "BAJISTA",
      porDebajo:
        "Peor de lo previsto apunta a enfriamiento, lo que suele adelantar las bajadas de tipos.",
      sesgoDebajo: "ALCISTA",
      nota: "El umbral de 50 importa tanto como la sorpresa: cruzarlo en un sentido u otro es noticia por sí mismo.",
    },
  },
  {
    match: ["consumer confidence", "michigan"],
    guide: {
      mide:
        "Una encuesta sobre cómo de optimistas están los hogares con su economía. Se mira como anticipo del consumo de los próximos meses.",
      porEncima:
        "Más confianza de la prevista apunta a que el consumo aguantará, y un consumo que aguanta retrasa las bajadas de tipos.",
      sesgoEncima: "BAJISTA",
      porDebajo:
        "Menos confianza apunta a que los hogares van a apretarse el cinturón, lo que suele adelantar las bajadas de tipos.",
      sesgoDebajo: "ALCISTA",
      nota: "Incluye las expectativas de inflación de los hogares, que a veces mueven más que el índice principal.",
    },
  },
  {
    match: ["durable goods"],
    guide: {
      mide:
        "Pedidos de bienes que duran años -- maquinaria, aviones, coches. Como son compras que se pueden aplazar, indican cuánta confianza hay en el futuro.",
      porEncima:
        "Más pedidos de los previstos apuntan a empresas invirtiendo con confianza, lo que aleja la urgencia de bajar tipos.",
      sesgoEncima: "BAJISTA",
      porDebajo:
        "Menos pedidos apuntan a inversión en pausa, lo que suele adelantar las bajadas de tipos.",
      sesgoDebajo: "ALCISTA",
      nota: "El dato general lo distorsionan los pedidos de aviones; por eso se mira también el que los excluye.",
    },
  },
];

/** La ficha de este dato, si es de los que se conocen bien. */
export function guideFor(event: { title: string; indicator: string | null }): IndicatorGuide | null {
  const texto = `${event.indicator ?? ""} ${event.title}`.toLowerCase();
  return REGLAS.find((regla) => regla.match.some((clave) => texto.includes(clave)))?.guide ?? null;
}
