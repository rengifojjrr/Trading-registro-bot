import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  COMPARATOR_LABELS,
  type Condition,
  type Operand,
  type PriceField,
  type Strategy,
} from "@/lib/backtest/types";
import { BLOCK_LABELS, STYLE_LABELS } from "@/lib/bots/types";
import { INDICATOR_BY_ID, type IndicatorId } from "@/lib/charts/indicators";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";
import type { EstrategiaDeLaBiblioteca } from "@/lib/paper/strategy-library";

/**
 * La ficha de una estrategia de la biblioteca: qué hace y qué se sabe de ella.
 *
 * Está escrita para alguien que no escribió las reglas. Eso decide las tres
 * cosas que la separan de volcar el objeto `Strategy` en pantalla:
 *
 *   1. **Las condiciones se leen como frases.** «el cierre cruza hacia arriba
 *      el máximo de las 55 velas anteriores» y no
 *      `{kind:"PRECIO",field:"CLOSE"} CRUZA_ARRIBA DONCHIAN_ALTO_55`. Un JSON
 *      en una ficha no es transparencia: es la misma opacidad con más
 *      caracteres, porque el que lo mira sigue sin poder decir si la regla es
 *      la que quería.
 *
 *   2. **Lo que no está medido lo dice en voz alta.** Con `medido` a null la
 *      ficha enseña un aviso, nunca un hueco ni un cero. Un cero se lee como
 *      «rindió cero» y un hueco como «todavía no ha cargado»; las dos cosas
 *      son mentira, y la segunda invita a encenderla creyendo que hay una
 *      medición detrás.
 *
 *   3. **Los avisos de la descripción se despegan del texto.** Las
 *      descripciones de la biblioteca meten sus limitaciones en frases que
 *      empiezan en mayúsculas -- «LO QUE ESTAS REGLAS NO DICEN», «AVISO SOBRE
 *      LAS CIFRAS» --, y dentro de un párrafo de doce líneas nadie las lee.
 *      Aquí cada una es su propio bloque marcado.
 *
 * No pinta el nombre de la estrategia: quien la coloca (el catálogo dentro de
 * un desplegable, la ficha de un bot debajo de su título) ya lo tiene puesto
 * encima, y repetirlo dos veces seguidas se lee como un fallo de maquetación.
 *
 * Presentacional y sin estado: sirve igual en el catálogo y en la ficha de un
 * bot. El botón de crear el bot -- o el enlace al que ya existe -- entra por
 * `accion`, porque eso depende de dónde se enseñe y esto no tiene por qué
 * saberlo.
 */

const PRECIOS: Record<PriceField, string> = {
  OPEN: "la apertura",
  HIGH: "el máximo de la vela",
  LOW: "el mínimo de la vela",
  CLOSE: "el cierre",
};

/**
 * Cada indicador dicho como lo diría una persona, con su artículo.
 *
 * No vale la etiqueta del catálogo (`Donchian alto 55`): metida en una frase
 * da «el cierre cruza hacia arriba Donchian alto 55», que es media traducción
 * y se lee peor que el original. Aquí cada uno trae la forma con la que entra
 * en una oración -- «el máximo de las 55 velas anteriores» --, y el tipo
 * `Record<IndicatorId, ...>` obliga a que el día que se añada un indicador al
 * catálogo alguien decida también cómo se dice.
 */
const INDICADORES_EN_PROSA: Record<IndicatorId, string> = {
  EMA9: "la EMA de 9",
  EMA21: "la EMA de 21",
  EMA50: "la EMA de 50",
  EMA55: "la EMA de 55",
  SMA50: "la media simple de 50",
  SMA200: "la media simple de 200",
  VWAP: "la VWAP del día",
  RSI14: "el RSI de 14",
  RSI2: "el RSI de 2",
  ATR14: "el ATR de 14",
  DONCHIAN_ALTO_20: "el máximo de las 20 velas anteriores",
  DONCHIAN_BAJO_10: "el mínimo de las 10 velas anteriores",
  DONCHIAN_ALTO_55: "el máximo de las 55 velas anteriores",
  DONCHIAN_BAJO_20: "el mínimo de las 20 velas anteriores",
  SUPERTREND: "el SuperTrend (ATR 10, factor 1,5)",
  BB_SUPERIOR: "la banda superior de Bollinger",
  BB_INFERIOR: "la banda inferior de Bollinger",
  ALTO_7: "el cierre más alto de las 7 velas anteriores",
  BAJO_7: "el cierre más bajo de las 7 velas anteriores",
  MACD: "la línea del MACD",
  MACD_SENAL: "la señal del MACD",
  IBS: "el IBS",
  RANGO_PREVIO: "el rango de la vela anterior",
};

/** Cuánto dura una vela de cada temporalidad, para traducir topes de tiempo. */
const MINUTOS_POR_VELA: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "6h": 360,
  "1d": 1440,
};

function operandoEnProsa(operando: Operand): string {
  if (operando.kind === "PRECIO") return PRECIOS[operando.field ?? "CLOSE"];
  if (operando.kind === "INDICADOR") {
    return operando.indicator ? INDICADORES_EN_PROSA[operando.indicator] : "un indicador sin elegir";
  }
  return formatNumber(operando.value ?? 0, 4);
}

function condicionEnProsa(condicion: Condition): string {
  return `${operandoEnProsa(condicion.left)} ${COMPARATOR_LABELS[condicion.comparator]} ${operandoEnProsa(condicion.right)}`;
}

/** «a, b y c». Con dos elementos no pone coma, que es como se escribe. */
function enumerar(partes: string[], union: "y" | "o"): string {
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} ${union} ${partes[partes.length - 1]}`;
}

/** «1 vez» y no «1 veces»: es la mitad de las estrategias de la biblioteca. */
function vecesElAtr(multiplo: number): string {
  return `${formatNumber(multiplo, 2)} ${multiplo === 1 ? "vez" : "veces"}`;
}

/** Un tope de velas dicho también en tiempo: «24 velas (6h)». */
function duracionDeVelas(velas: number, temporalidad: string): string | null {
  const minutos = MINUTOS_POR_VELA[temporalidad.trim().toLowerCase()];
  return minutos === undefined ? null : formatDuration(velas * minutos * 60);
}

/**
 * Una frase abre bloque de aviso si arranca en mayúsculas.
 *
 * Es el convenio que ya usan las descripciones de la biblioteca, así que se
 * lee de ellas en vez de pedirles otro campo: o una palabra de tres letras o
 * más («LIMITACIÓN:», «APROXIMACIÓN,»), o dos seguidas de dos o más («LO QUE
 * FALTA», «NO ESTÁ MEDIDA»). Si mañana una descripción no lo cumple, el texto
 * sale entero como un párrafo normal -- se pierde el marco, no la frase.
 */
const ARRANQUE_DE_AVISO = /^(?:[A-ZÁÉÍÓÚÜÑ]{3,}|[A-ZÁÉÍÓÚÜÑ]{2,}[\s,:]+[A-ZÁÉÍÓÚÜÑ]{2,})/;

interface BloqueDeTexto {
  texto: string;
  aviso: boolean;
}

function enBloques(descripcion: string): BloqueDeTexto[] {
  // Se corta por «. » y se devuelve el punto a su frase; partir con una
  // mirada atrás (`(?<=\.)`) sería más corto y no compila: este repositorio
  // apunta a ES2017, donde esa construcción todavía no existe.
  const frases = descripcion
    .split(". ")
    .map((frase, i, todas) => (i < todas.length - 1 ? `${frase}.` : frase))
    .filter((frase) => frase.trim().length > 0);

  const bloques: BloqueDeTexto[] = [];
  for (const frase of frases) {
    const abre = ARRANQUE_DE_AVISO.test(frase);
    if (bloques.length === 0 || abre) bloques.push({ texto: frase, aviso: abre });
    else bloques[bloques.length - 1].texto += ` ${frase}`;
  }
  return bloques;
}

/** Los indicadores que toca la estrategia, sin repetir y en orden de aparición. */
function indicadoresUsados(reglas: Strategy): IndicatorId[] {
  const vistos: IndicatorId[] = [];
  const mirar = (operando: Operand) => {
    if (operando.kind === "INDICADOR" && operando.indicator && !vistos.includes(operando.indicator)) {
      vistos.push(operando.indicator);
    }
  };
  for (const condicion of [...reglas.entry, ...reglas.exit.conditions]) {
    mirar(condicion.left);
    mirar(condicion.right);
  }
  return vistos;
}

export function EstrategiaDetalle({
  estrategia,
  accion,
}: {
  estrategia: EstrategiaDeLaBiblioteca;
  /** Qué se puede hacer con ella aquí: crear el bot, abrir el que ya existe. */
  accion?: ReactNode;
}) {
  const { reglas } = estrategia;
  const indicadores = indicadoresUsados(reglas);
  const compra = reglas.direction !== "SHORT";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{estrategia.mercado}</Badge>
        <Badge variant="outline">velas de {estrategia.temporalidad}</Badge>
        <Badge variant="outline">{STYLE_LABELS[estrategia.estilo]}</Badge>
        <Badge variant="outline">{BLOCK_LABELS[estrategia.bloque]}</Badge>
        <Badge variant={compra ? "positive" : "negative"}>
          {compra ? "Compra (largo)" : "Vende (corto)"}
        </Badge>
      </div>

      <section className="flex flex-col gap-1">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Por qué debería funcionar
        </h4>
        <p className="text-sm leading-relaxed text-foreground">{estrategia.hipotesis}</p>
      </section>

      <CifrasMedidas medido={estrategia.medido} />

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Las reglas, en castellano
        </h4>
        <Entrada reglas={reglas} />
        <Salida reglas={reglas} temporalidad={estrategia.temporalidad} />
        <Horario horas={reglas.hours} />
      </section>

      {indicadores.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Lo que mira para decidir
          </h4>
          <dl className="flex flex-col gap-1.5">
            {indicadores.map((id) => (
              <div key={id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="text-sm font-medium text-foreground sm:w-44 sm:shrink-0">
                  {INDICATOR_BY_ID[id].label}
                </dt>
                <dd className="text-sm text-muted-foreground">{INDICATOR_BY_ID[id].hint}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Qué hace, con detalle
        </h4>
        {enBloques(estrategia.descripcion).map((bloque, i) =>
          bloque.aviso ? (
            <p
              key={i}
              className="rounded-md border-l-2 border-warning/60 bg-warning/10 px-3 py-2 text-sm leading-relaxed text-foreground"
            >
              {bloque.texto}
            </p>
          ) : (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">
              {bloque.texto}
            </p>
          ),
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          De dónde sale
        </h4>
        <p className="text-sm text-muted-foreground">{estrategia.procedencia}</p>
      </section>

      {accion ? <div className="flex flex-wrap items-center gap-2 pt-1">{accion}</div> : null}
    </div>
  );
}

/**
 * Las cifras, o la falta de ellas.
 *
 * Cuando faltan ocupan el mismo sitio y el mismo tamaño que cuando están: es
 * lo que impide que una ficha sin medir parezca una ficha a medio cargar.
 */
function CifrasMedidas({ medido }: { medido: EstrategiaDeLaBiblioteca["medido"] }) {
  if (!medido) {
    return (
      <section className="flex flex-col gap-1 rounded-md border border-dashed border-border px-3 py-2.5">
        <h4 className="text-sm font-medium text-foreground">Sin backtest propio todavía</h4>
        <p className="text-sm text-muted-foreground">
          Nadie ha medido estas reglas exactas en este proyecto, así que aquí no hay ni
          rentabilidad ni caída máxima que enseñar. Lo que sí hay es de dónde sale la idea, más
          abajo. Enciéndela en papel y sus cifras serán las suyas, no las de un primo lejano.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Lo que dio al medirla
      </h4>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra
          label="Rentabilidad"
          valor={formatPercent(medido.pnlPct)}
          tono={medido.pnlPct >= 0 ? "positive" : "negative"}
        />
        <Cifra label="Caída máxima" valor={`-${medido.ddPct.toFixed(2)}%`} tono="negative" />
        <Cifra
          label="Factor de ganancia"
          valor={formatNumber(medido.profitFactor, 3)}
          tono={medido.profitFactor >= 1 ? "positive" : "negative"}
        />
        <Cifra label="Operaciones" valor={String(medido.trades)} tono="neutral" />
      </dl>
      <p className="text-xs text-muted-foreground">
        Medido sobre {medido.ventana}. Son las cifras de aquella prueba, no una promesa: fuera de
        esa ventana la estrategia no ha demostrado nada.
      </p>
    </section>
  );
}

function Cifra({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono: "positive" | "negative" | "neutral";
}) {
  const color =
    tono === "positive" ? "text-positive" : tono === "negative" ? "text-negative" : "text-foreground";

  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums ${color}`}>{valor}</dd>
    </div>
  );
}

function Entrada({ reglas }: { reglas: Strategy }) {
  const verbo = reglas.direction === "SHORT" ? "Vende (se pone corta)" : "Compra (se pone larga)";
  const condiciones = reglas.entry.map(condicionEnProsa);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">
        {condiciones.length === 0
          ? `${verbo} en cuanto puede: no tiene ninguna condición de entrada.`
          : condiciones.length === 1
            ? `${verbo} cuando ${condiciones[0]}.`
            : `${verbo} cuando se cumplen las ${condiciones.length} a la vez:`}
      </p>
      {condiciones.length > 1 ? (
        <ul className="flex flex-col gap-1">
          {condiciones.map((frase, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span aria-hidden className="text-muted-foreground/60">
                ·
              </span>
              {frase}
            </li>
          ))}
        </ul>
      ) : null}
      {reglas.direction === "BOTH" ? (
        // La biblioteca no declara ninguna así, pero si alguna acabara siéndolo
        // hay que decirlo aquí: el motor colapsa BOTH a largo y la estrategia
        // operaría media cara sin avisar.
        <p className="text-xs text-warning">
          Declarada en los dos sentidos, pero el motor sólo sabe llevar uno: en la práctica
          compra y nunca vende.
        </p>
      ) : null}
    </div>
  );
}

function Salida({ reglas, temporalidad }: { reglas: Strategy; temporalidad: string }) {
  const { stopAtr, targetAtr, maxBars, conditions } = reglas.exit;
  const salidas: string[] = [];

  if (stopAtr !== null) {
    salidas.push(
      `se le pone en contra ${vecesElAtr(stopAtr)} el ATR de la vela en que entró (el stop)`,
    );
  }
  if (targetAtr !== null) {
    salidas.push(`gana ${vecesElAtr(targetAtr)} ese mismo ATR (el objetivo)`);
  }
  if (maxBars !== null) {
    const duracion = duracionDeVelas(maxBars, temporalidad);
    salidas.push(
      `pasan ${maxBars} vela${maxBars === 1 ? "" : "s"}${duracion ? ` (${duracion})` : ""} sin que ocurra ninguna de las otras`,
    );
  }
  for (const condicion of conditions) salidas.push(condicionEnProsa(condicion));

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-secondary/30 px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">
        {salidas.length === 0
          ? "No tiene ninguna salida escrita: una vez dentro, se queda."
          : salidas.length === 1
            ? `Cierra cuando ${salidas[0]}.`
            : "Cierra en cuanto pasa cualquiera de estas cosas:"}
      </p>
      {salidas.length > 1 ? (
        <ul className="flex flex-col gap-1">
          {salidas.map((frase, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span aria-hidden className="text-muted-foreground/60">
                ·
              </span>
              {frase}
            </li>
          ))}
        </ul>
      ) : null}
      {stopAtr === null && targetAtr === null && conditions.length > 0 ? (
        // Vale la pena decirlo con todas las letras: una tendencial sin stop no
        // es un descuido, es la parte de la estrategia donde está su ventaja, y
        // el que la lea sin saberlo pensará que falta una regla.
        <p className="text-xs text-muted-foreground">
          Sin stop de ATR y sin objetivo: la condición de arriba hace de las dos cosas. Es lo que
          le permite aguantar los tramos largos, y también lo que la deja expuesta a una caída de
          golpe entre dos velas.
        </p>
      ) : null}
    </div>
  );
}

function Horario({ horas }: { horas: number[] }) {
  if (horas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin horario: mira todas las velas, a cualquier hora del día.
      </p>
    );
  }

  const enOrden = [...horas].sort((a, b) => a - b).map((h) => `${String(h).padStart(2, "0")}:00`);

  return (
    <p className="text-sm text-muted-foreground">
      Sólo entra en las velas que abren a las {enumerar(enOrden, "o")}, en hora UTC -- que es la de
      las velas, no la del reloj de casa.
    </p>
  );
}
