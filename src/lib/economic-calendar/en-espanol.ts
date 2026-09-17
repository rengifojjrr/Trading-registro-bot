/**
 * Los nombres de los datos económicos, en español.
 *
 * La fuente los da en inglés --«Initial Jobless Claims», «Core PCE Prices QoQ
 * 2nd Est», «4-Week Bill Auction»-- y son casi trescientas cadenas distintas.
 * Un diccionario de trescientas entradas sería trabajo para una tarde y
 * trabajo otra vez cada mes, porque la fuente añade datos nuevos
 * continuamente.
 *
 * Pero un título no es una frase: es **un nombre y unos matices**. «Core PCE
 * Prices QoQ 2nd Est» es el índice de precios PCE subyacente, trimestral, en
 * su segunda estimación. Los matices son una docena y se repiten en todo; los
 * nombres son muchos pero cada uno aparece con cuatro o cinco combinaciones de
 * matices distintas. Separarlos convierte trescientas traducciones en unas
 * ciento veinte, y hace que un dato nuevo con un matiz conocido salga
 * traducido sin tocar nada.
 *
 * El orden es: primero se apartan los matices del final, luego se busca el
 * nombre que queda, y si no está se prueban las plantillas -- «Fed <apellido>
 * Speech», «EIA <algo> Change», «<N>-Week Bill Auction» -- que son las que
 * cubren las familias que crecen solas.
 *
 * **Lo que no se sabe decir se queda en inglés.** Es feo y es cierto. La
 * alternativa --traducir a ojo-- convierte «Core PCE Price Index» en algo que
 * suena español y significa otra cosa, y un dato macro mal nombrado en una
 * pantalla desde la que se opera es peor que uno sin traducir.
 */

/**
 * Los matices que la fuente pega al final del nombre.
 *
 * En orden de longitud: «qoq 2nd est» tiene que reconocerse antes que «qoq»,
 * o el «2nd est» se quedaría pegado al nombre y no lo encontraría nadie.
 */
const MATICES: { patron: RegExp; es: string; orden: number }[] = [
  // `orden` es cómo se leen juntos, no cómo se buscan. Se buscan de más largo
  // a más corto --«qoq 2nd est» antes que «qoq»-- y se dicen por periodo y
  // luego por versión: «trimestral, segunda estimación» y no al revés.
  { patron: /\b2nd est\b/i, es: "segunda estimación", orden: 2 },
  { patron: /\bannual revision\b/i, es: "revisión anual", orden: 2 },
  { patron: /\bprel\b/i, es: "preliminar", orden: 3 },
  { patron: /\bflash\b/i, es: "adelantado", orden: 3 },
  { patron: /\badv\b/i, es: "adelantado", orden: 3 },
  { patron: /\bfinal\b/i, es: "final", orden: 3 },
  { patron: /\bs\.a\b/i, es: "desestacionalizado", orden: 4 },
  { patron: /\byoy\b/i, es: "interanual", orden: 1 },
  { patron: /\bmom\b/i, es: "mensual", orden: 1 },
  { patron: /\bqoq\b/i, es: "trimestral", orden: 1 },
];

/**
 * Aparta los matices del final y devuelve el nombre limpio con su lista.
 *
 * El nombre conserva sus mayúsculas: de él salen los apellidos --«Powell»,
 * «Bessent»-- que las plantillas meten dentro de la frase traducida, y un
 * «comparecencia de powell» delata la máquina que hay detrás.
 */
function separarMatices(titulo: string): { base: string; matices: string[] } {
  let base = titulo;
  const encontrados: { es: string; orden: number }[] = [];

  for (const { patron, es, orden } of MATICES) {
    if (patron.test(base)) {
      encontrados.push({ es, orden });
      base = base.replace(patron, " ");
    }
  }

  return {
    base: base.replace(/\s+/g, " ").trim(),
    matices: encontrados.sort((a, b) => a.orden - b.orden).map((m) => m.es),
  };
}

/**
 * Los nombres, sin matices y en minúsculas.
 *
 * Están agrupados por lo que son y no alfabéticamente: cuando haya que añadir
 * uno, lo que se busca es «dónde van los de empleo», no la letra.
 */
const NOMBRES: Record<string, string> = {
  // -- La Reserva Federal ---------------------------------------------------
  "fed interest rate decision": "Decisión de tipos de la Fed",
  "fomc minutes": "Actas de la Fed",
  "fomc press conference": "Rueda de prensa de la Fed",
  "fed press conference": "Rueda de prensa de la Fed",
  "fomc economic projections": "Proyecciones económicas de la Fed",
  "fed balance sheet": "Balance de la Fed",
  "fed beige book": "Libro Beige de la Fed",
  "fed bank stress test results": "Resultados de las pruebas de resistencia bancaria",
  "jackson hole symposium": "Simposio de Jackson Hole",
  "loan officer survey": "Encuesta a responsables de crédito",
  "interest rate projection - current": "Proyección de tipos: año en curso",
  "interest rate projection - 1st yr": "Proyección de tipos: primer año",
  "interest rate projection - 2nd yr": "Proyección de tipos: segundo año",
  "interest rate projection - 3rd yr": "Proyección de tipos: tercer año",
  "interest rate projection - longer": "Proyección de tipos: a largo plazo",

  // -- Empleo ---------------------------------------------------------------
  "initial jobless claims": "Peticiones iniciales de desempleo",
  "continuing jobless claims": "Peticiones continuadas de desempleo",
  "jobless claims 4-week average": "Media de 4 semanas de peticiones de desempleo",
  "non farm payrolls": "Nóminas no agrícolas",
  "nonfarm payrolls private": "Nóminas no agrícolas privadas",
  "government payrolls": "Empleo público",
  "manufacturing payrolls": "Empleo manufacturero",
  "unemployment rate": "Tasa de paro",
  "u-6 unemployment rate": "Tasa de paro U-6",
  "participation rate": "Tasa de actividad",
  "adp employment change": "Empleo privado ADP",
  "adp employment change weekly": "Empleo privado ADP (semanal)",
  "average hourly earnings": "Salario medio por hora",
  "average weekly hours": "Horas trabajadas por semana",
  "jolts job openings": "Vacantes de empleo (JOLTS)",
  "jolts job quits": "Abandonos voluntarios de empleo (JOLTS)",
  "challenger job cuts": "Despidos anunciados (Challenger)",
  "employment cost index": "Índice de coste laboral",
  "employment cost - wages": "Coste laboral: salarios",
  "employment cost - benefits": "Coste laboral: prestaciones",
  "unit labour costs": "Costes laborales unitarios",
  "nonfarm productivity": "Productividad no agrícola",

  // -- Precios --------------------------------------------------------------
  "inflation rate": "Inflación",
  "core inflation rate": "Inflación subyacente",
  cpi: "IPC",
  "core cpi": "IPC subyacente",
  ppi: "Precios de producción",
  "core ppi": "Precios de producción subyacentes",
  "ppi ex food, energy and trade": "Precios de producción sin alimentos, energía ni comercio",
  "pce price index": "Índice de precios PCE",
  "core pce price index": "Índice de precios PCE subyacente",
  "pce prices": "Precios PCE",
  "core pce prices": "Precios PCE subyacentes",
  "gdp price index": "Deflactor del PIB",
  "import prices": "Precios de importación",
  "export prices": "Precios de exportación",
  "used car prices": "Precios de coches usados",
  "consumer inflation expectations": "Expectativas de inflación del consumidor",

  // -- Actividad y crecimiento ---------------------------------------------
  "gdp growth rate": "Crecimiento del PIB",
  "gdp sales": "Ventas finales del PIB",
  "real consumer spending": "Consumo real de los hogares",
  "personal income": "Renta personal",
  "personal spending": "Gasto personal",
  "real personal spending": "Gasto personal real",
  "retail sales": "Ventas minoristas",
  "retail sales ex autos": "Ventas minoristas sin automóviles",
  "retail sales ex gas/autos": "Ventas minoristas sin gasolina ni automóviles",
  "retail sales control group": "Ventas minoristas del grupo de control",
  "redbook": "Ventas minoristas Redbook",
  "industrial production": "Producción industrial",
  "manufacturing production": "Producción manufacturera",
  "capacity utilization": "Utilización de la capacidad instalada",
  "durable goods orders": "Pedidos de bienes duraderos",
  "durable goods orders ex defense": "Pedidos de bienes duraderos sin defensa",
  "durable goods orders ex transp": "Pedidos de bienes duraderos sin transporte",
  "non defense goods orders ex air": "Pedidos de bienes sin defensa ni aviación",
  "factory orders": "Pedidos a fábrica",
  "factory orders ex transportation": "Pedidos a fábrica sin transporte",
  "business inventories": "Existencias empresariales",
  "wholesale inventories": "Existencias mayoristas",
  "retail inventories ex autos": "Existencias minoristas sin automóviles",
  "total vehicle sales": "Venta total de vehículos",
  "corporate profits": "Beneficios empresariales",
  "construction spending": "Gasto en construcción",

  // -- Encuestas y PMI ------------------------------------------------------
  "ism manufacturing pmi": "PMI manufacturero (ISM)",
  "ism manufacturing employment": "ISM manufacturero: empleo",
  "ism manufacturing new orders": "ISM manufacturero: pedidos nuevos",
  "ism manufacturing prices": "ISM manufacturero: precios",
  "ism services pmi": "PMI de servicios (ISM)",
  "ism services business activity": "ISM de servicios: actividad",
  "ism services employment": "ISM de servicios: empleo",
  "ism services new orders": "ISM de servicios: pedidos nuevos",
  "ism services prices": "ISM de servicios: precios",
  "chicago pmi": "PMI de Chicago",
  "cb consumer confidence": "Confianza del consumidor (Conference Board)",
  "cb leading index": "Índice adelantado (Conference Board)",
  "consumer confidence": "Confianza del consumidor",
  "nfib business optimism index": "Optimismo de la pequeña empresa (NFIB)",
  "lmi logistics managers index": "Índice de responsables de logística",
  "rcm/tipp economic optimism index": "Optimismo económico RCM/TIPP",
  "nahb housing market index": "Índice del mercado de vivienda (NAHB)",
  "michigan consumer sentiment": "Confianza del consumidor de Michigan",
  "michigan consumer expectations": "Expectativas del consumidor de Michigan",
  "michigan current conditions": "Condiciones actuales según Michigan",
  "michigan inflation expectations": "Expectativas de inflación de Michigan",
  "michigan 5 year inflation expectations": "Expectativas de inflación a 5 años de Michigan",

  // -- Encuestas regionales de la Fed --------------------------------------
  "ny empire state manufacturing index": "Índice manufacturero de Nueva York (Empire State)",
  "philadelphia fed manufacturing index": "Índice manufacturero de la Fed de Filadelfia",
  "philly fed business conditions": "Fed de Filadelfia: condiciones del negocio",
  "philly fed capex index": "Fed de Filadelfia: inversión prevista",
  "philly fed employment": "Fed de Filadelfia: empleo",
  "philly fed new orders": "Fed de Filadelfia: pedidos nuevos",
  "philly fed prices paid": "Fed de Filadelfia: precios pagados",
  "dallas fed manufacturing index": "Índice manufacturero de la Fed de Dallas",
  "dallas fed services index": "Índice de servicios de la Fed de Dallas",
  "dallas fed services revenues index": "Fed de Dallas: ingresos de servicios",
  "kansas fed composite index": "Índice compuesto de la Fed de Kansas",
  "kansas fed manufacturing index": "Índice manufacturero de la Fed de Kansas",
  "richmond fed manufacturing index": "Índice manufacturero de la Fed de Richmond",
  "richmond fed manufacturing shipments index": "Fed de Richmond: envíos manufactureros",
  "richmond fed services revenues index": "Fed de Richmond: ingresos de servicios",
  "chicago fed national activity index": "Índice nacional de actividad de la Fed de Chicago",
  "ny fed services activity index": "Índice de actividad de servicios de la Fed de Nueva York",

  // -- Vivienda -------------------------------------------------------------
  "building permits": "Permisos de construcción",
  "housing starts": "Viviendas iniciadas",
  "new home sales": "Venta de vivienda nueva",
  "existing home sales": "Venta de vivienda usada",
  "pending home sales": "Ventas pendientes de vivienda",
  "house price index": "Índice de precios de la vivienda",
  "s&p/case-shiller home price": "Precio de la vivienda S&P/Case-Shiller",
  "mba mortgage applications": "Solicitudes de hipoteca (MBA)",
  "mba mortgage market index": "Índice hipotecario (MBA)",
  "mba mortgage refinance index": "Índice de refinanciación hipotecaria (MBA)",
  "mba purchase index": "Índice de compra de vivienda (MBA)",

  // -- Sector exterior y flujos --------------------------------------------
  "balance of trade": "Balanza comercial",
  "goods trade balance": "Balanza comercial de bienes",
  "current account": "Balanza por cuenta corriente",
  exports: "Exportaciones",
  imports: "Importaciones",
  "foreign bond investment": "Inversión extranjera en bonos",
  "net long-term tic flows": "Flujos netos de capital a largo plazo (TIC)",
  "overall net capital flows": "Flujos netos de capital",

  // -- Dinero, deuda y Tesoro ----------------------------------------------
  "money supply": "Masa monetaria",
  "consumer credit change": "Variación del crédito al consumo",
  "total household debt": "Deuda total de los hogares",
  "monthly budget statement": "Saldo presupuestario mensual",
  "treasury refunding announcement": "Anuncio de refinanciación del Tesoro",
  "treasury refunding financing estimates": "Estimaciones de financiación del Tesoro",
  "international monetary market (imm) date": "Vencimiento del IMM",

  // -- Energía y agricultura ------------------------------------------------
  "api crude oil stock change": "API: cambio en reservas de crudo",
  "eia short-term energy outlook": "Perspectivas energéticas a corto plazo (EIA)",
  "baker hughes oil rig count": "Sondeos de petróleo activos (Baker Hughes)",
  "baker hughes total rigs count": "Sondeos activos totales (Baker Hughes)",
  "wasde report": "Informe WASDE de oferta y demanda agrícola",
  "nopa crush report": "Informe NOPA de molienda de soja",

  // -- Días festivos, que también salen en el calendario -------------------
  christmas: "Navidad",
  "new year’s day": "Año Nuevo",
  "independence day": "Día de la Independencia",
  "labor day": "Día del Trabajo",
  "memorial day": "Día de los Caídos",
  "thanksgiving day": "Acción de Gracias",
  "columbus day": "Día de la Hispanidad",
  "veterans day": "Día de los Veteranos",
  "martin luther king, jr. day": "Día de Martin Luther King",
  "washington’s birthday": "Natalicio de Washington",
  "juneteenth national independence day": "Juneteenth, fin de la esclavitud",

  // -- Política -------------------------------------------------------------
  "un general assembly": "Asamblea General de la ONU",
  "president trump state of the union speech": "Discurso del Estado de la Unión",
  "president trump and president xi summit": "Cumbre entre los presidentes de EE. UU. y China",
  "us president trump speech": "Discurso del presidente de EE. UU.",
};

/**
 * Las familias que crecen solas.
 *
 * Los gobernadores de la Fed cambian, las subastas del Tesoro tienen todos los
 * plazos imaginables y la EIA publica el inventario de cada derivado del
 * petróleo. Cada uno de esos es un título nuevo cada vez, y ninguno merece una
 * entrada propia.
 */
const PLANTILLAS: [RegExp, string][] = [
  [/^fed chair (.+) (?:speech|testimony)$/i, "Comparecencia de $1, presidente de la Fed"],
  [/^fed chair nominee (.+) confirmation hearing$/i, "Audiencia de confirmación de $1 para presidir la Fed"],
  [/^fed (.+) speech$/i, "Discurso de $1 (Fed)"],
  [/^fed (.+) testimony$/i, "Comparecencia de $1 (Fed)"],
  [/^treasury secretary (.+) speech$/i, "Discurso de $1, secretario del Tesoro"],

  [/^(\d+)-week bill auction$/i, "Subasta de letras a $1 semanas"],
  [/^(\d+)-month bill auction$/i, "Subasta de letras a $1 meses"],
  [/^(\d+)-year note auction$/i, "Subasta de bonos a $1 años"],
  [/^(\d+)-year bond auction$/i, "Subasta de bonos a $1 años"],
  [/^(\d+)-year tips auction$/i, "Subasta de bonos indexados a la inflación a $1 años"],
  [/^(\d+)-year frn auction$/i, "Subasta de bonos a tipo variable a $1 años"],
  [/^(\d+)-year mortgage rate$/i, "Tipo hipotecario a $1 años"],
  [/^mba (\d+)-year mortgage rate$/i, "Tipo hipotecario a $1 años (MBA)"],

  [/^eia (.+) change$/i, "EIA: cambio en $1"],
  [/^ny fed (.+)$/i, "Fed de Nueva York: $1"],
  [/^s&p global (.+) pmi$/i, "PMI $1 de S&P Global"],
  [/^prospective plantings - (.+)$/i, "Intención de siembra: $1"],
  [/^quarterly grain stocks - (.+)$/i, "Existencias trimestrales de grano: $1"],
];

/** Las piezas que aparecen dentro de las plantillas y también hay que decir. */
const PIEZAS: [RegExp, string][] = [
  [/\bcushing crude oil stocks\b/gi, "reservas de crudo en Cushing"],
  [/\bcrude oil stocks\b/gi, "reservas de crudo"],
  [/\bcrude oil imports\b/gi, "importaciones de crudo"],
  [/\brefinery crude runs\b/gi, "crudo procesado en refinerías"],
  [/\bdistillate fuel production\b/gi, "producción de destilados"],
  [/\bdistillate stocks\b/gi, "reservas de destilados"],
  [/\bgasoline production\b/gi, "producción de gasolina"],
  [/\bgasoline stocks\b/gi, "reservas de gasolina"],
  [/\bheating oil stocks\b/gi, "reservas de gasóleo de calefacción"],
  [/\bnatural gas stocks\b/gi, "reservas de gas natural"],
  [/\bmanufacturing\b/gi, "manufacturero"],
  [/\bservices\b/gi, "de servicios"],
  [/\bcomposite\b/gi, "compuesto"],
  [/\bcorn\b/gi, "maíz"],
  [/\bsoy\b/gi, "soja"],
  [/\bwheat\b/gi, "trigo"],
  [/\bcotton\b/gi, "algodón"],
  [/\bbill purchases\b/gi, "compras de letras"],
  [/\btreasury purchases\b/gi, "compras de deuda"],
  [/\bmonths\b/gi, "meses"],
  [/\byrs\b/gi, "años"],
  [/\bto\b/gi, "a"],
];

function traducirPiezas(texto: string): string {
  return PIEZAS.reduce((acc, [patron, es]) => acc.replace(patron, es), texto);
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El nombre base, si lo sabemos decir. */
function traducirBase(base: string): string | null {
  const directo = NOMBRES[base.toLowerCase()];
  if (directo) return directo;

  for (const [patron, es] of PLANTILLAS) {
    const encaje = base.match(patron);
    if (!encaje) continue;
    const traducido = es.replace(/\$(\d)/g, (_, n: string) =>
      traducirPiezas(encaje[Number(n)] ?? ""),
    );
    return capitalizar(traducido);
  }

  return null;
}

/**
 * El título de un dato económico, en español si sabemos decirlo.
 *
 * Devuelve el original cuando no: en inglés y cierto es mejor que en español
 * e inventado.
 */
export function tituloEnEspanol(titulo: string): string {
  const limpio = titulo.trim();
  if (limpio === "") return limpio;

  const { base, matices } = separarMatices(limpio);
  const nombre = traducirBase(base);
  if (!nombre) return limpio;

  return matices.length > 0 ? `${nombre} (${matices.join(", ")})` : nombre;
}

/** Si sabemos decirlo en español, para que la pantalla pueda avisar cuando no. */
export function hayTraduccion(titulo: string): boolean {
  return tituloEnEspanol(titulo) !== titulo.trim();
}
