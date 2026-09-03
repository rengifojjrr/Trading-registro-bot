"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts";

import { resolverTemaCanvas, type TemaCanvas } from "@/lib/charts/tema-canvas";

import { formatMoney } from "@/lib/format";
import {
  lineasDe,
  marcadoresDe,
  type LineaDeNivel,
  type OperacionMarcable,
  type PosicionMarcable,
} from "@/lib/paper/marcadores";

/**
 * El gráfico de velas de un bot con todas sus entradas y salidas marcadas.
 *
 * Es lo que pidió el usuario: «un gráfico de cada bot donde se van marcando
 * las entradas y las salidas, como el gráfico de la parte de operaciones».
 * Se parece a aquél a propósito -- mismas opciones, mismos colores, mismas
 * flechas -- para que quien ya sabe leer el de una operación lea éste sin
 * aprender nada nuevo.
 *
 * Pero no reutiliza `TradeChart`. Aquél es el gráfico de UNA operación y
 * arrastra la repetición, la práctica, los dibujos, los indicadores y la
 * subida de capturas; aquí hay muchas operaciones y ninguna de esas cosas.
 * Éste es de sólo lectura: recibe velas, operaciones y la posición abierta, y
 * pinta. La conversión de operaciones a flechas vive en `lib/paper/marcadores`
 * y se prueba allí, porque un canvas no se prueba sin navegador.
 *
 * No lleva `ChartFrame`: lo pone la página, que es quien sabe qué título y
 * qué pregunta le corresponden.
 */

export interface VelaDelBot {
  /** Apertura de la vela en segundos UNIX, que es lo que entiende la librería. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const ALTO_GRAFICO = 360;

/**
 * La paleta viene del módulo compartido de tema para canvas, que es el único
 * sitio con los respaldos: así este gráfico y el de operaciones cambian
 * juntos cuando cambia la paleta y ninguno copia literales de color.
 */
type TemaGrafico = TemaCanvas;

const resolverTema = resolverTemaCanvas;

/**
 * De qué color va cada línea de nivel. La entrada del color de las flechas de
 * entrada, para que se lea que son la misma cosa; el stop del color de las
 * pérdidas y el objetivo del de las ganancias, que es lo que significan.
 */
const COLOR_DE_LINEA: Record<LineaDeNivel["tipo"], keyof TemaGrafico> = {
  ENTRADA: "entrada",
  STOP: "baja",
  OBJETIVO: "sube",
};

/**
 * Cómo se describe cada flecha en la leyenda según el lado que opera el bot.
 *
 * Un bot de la biblioteca opera un solo lado (ver `strategy-library.ts`), así
 * que la leyenda puede decir literalmente qué flecha buscar. Sin lado conocido
 * se describe sólo por color y se explica la regla general debajo.
 */
function textoDeFlechas(direccion?: "LARGO" | "CORTO"): { entrada: string; salida: string } {
  if (direccion === "LARGO") {
    return { entrada: "flecha hacia arriba, bajo la vela", salida: "flecha hacia abajo, sobre la vela" };
  }
  if (direccion === "CORTO") {
    return { entrada: "flecha hacia abajo, sobre la vela", salida: "flecha hacia arriba, bajo la vela" };
  }
  return { entrada: "flecha", salida: "flecha" };
}

export function BotChart({
  velas,
  operaciones,
  posicion,
  segundosPorVela,
  moneda = "USD",
  direccionPorDefecto,
}: {
  velas: VelaDelBot[];
  operaciones: OperacionMarcable[];
  posicion: PosicionMarcable | null;
  /** El tamaño de la vela del gráfico, para alinear cada flecha a su vela. */
  segundosPorVela: number;
  moneda?: string;
  /** El lado que opera el bot, para que la leyenda diga qué flecha buscar. */
  direccionPorDefecto?: "LARGO" | "CORTO";
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Sube cada vez que cambia la apariencia, para reconstruir el gráfico con
  // los colores nuevos. Un canvas no hereda el CSS como el resto de la
  // interfaz, así que sin esto cambiar de paleta dejaría un rectángulo con los
  // colores viejos en medio de la página.
  //
  // Se vigilan los atributos de apariencia y, además, la preferencia del
  // sistema: con el tema en «automático» cambiar de claro a oscuro en el
  // sistema operativo no toca el DOM, y el observador de mutaciones no se
  // entera de nada.
  const [versionTema, setVersionTema] = useState(0);
  useEffect(() => {
    const repintar = () => setVersionTema((v) => v + 1);

    const observador = new MutationObserver(repintar);
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-paleta"],
    });

    const sistema = window.matchMedia("(prefers-color-scheme: dark)");
    sistema.addEventListener("change", repintar);

    return () => {
      observador.disconnect();
      sistema.removeEventListener("change", repintar);
    };
  }, []);

  // El gráfico entero se construye y se tira en un solo efecto. A diferencia
  // del de operaciones, aquí no hay nada del usuario que perder al
  // reconstruirlo -- ni dibujos, ni zoom que valga la pena conservar --, así
  // que separar «crear» de «poner datos» sería complejidad sin beneficio.
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor || velas.length === 0) return;

    const tema = resolverTema();

    const grafico = createChart(contenedor, {
      width: contenedor.clientWidth,
      height: ALTO_GRAFICO,
      layout: {
        background: { type: ColorType.Solid, color: tema.fondo },
        textColor: tema.texto,
      },
      grid: {
        vertLines: { color: tema.rejilla },
        horzLines: { color: tema.rejilla },
      },
      rightPriceScale: { borderColor: tema.rejilla },
      // Arrastrar el eje para comprimir o estirar, como en el de operaciones:
      // con cien flechas en pantalla hace falta poder abrir una zona.
      handleScale: { axisPressedMouseMove: { price: true, time: true } },
      timeScale: { borderColor: tema.rejilla, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      // Explícito y no el del navegador de quien visita: es el mismo "en-US"
      // que usa lib/format.ts, y así los ejes y las cifras de la página no se
      // contradicen.
      localization: { locale: "en-US" },
    });

    const serie = grafico.addSeries(CandlestickSeries, {
      upColor: tema.sube,
      downColor: tema.baja,
      borderUpColor: tema.sube,
      borderDownColor: tema.baja,
      wickUpColor: tema.sube,
      wickDownColor: tema.baja,
    });

    // Ordenadas y sin repetidas antes de entregarlas: la librería lanza una
    // excepción con datos desordenados o con dos velas en el mismo instante,
    // y una excepción dentro de un efecto se lleva por delante la sección
    // entera de la página. `velasPublicas` ya las devuelve bien, pero el
    // gráfico no debería depender de quién lo alimenta.
    const datos = [...velas]
      .sort((a, b) => a.time - b.time)
      .filter((vela, i, todas) => i === 0 || vela.time !== todas[i - 1].time)
      .map((vela) => ({
        time: vela.time as UTCTimestamp,
        open: vela.open,
        high: vela.high,
        low: vela.low,
        close: vela.close,
      }));
    serie.setData(datos);

    createSeriesMarkers(
      serie,
      marcadoresDe(operaciones, posicion, { entrada: tema.entrada, salida: tema.salida }, segundosPorVela),
    );

    // La entrada sólida y los niveles discontinuos, igual que en el gráfico de
    // operaciones: la entrada es un hecho y el stop y el objetivo son planes.
    // Con el precio en el título porque los tres pueden estar tan juntos que
    // sus etiquetas del eje se tapen entre sí.
    for (const linea of lineasDe(posicion)) {
      serie.createPriceLine({
        price: linea.precio,
        color: tema[COLOR_DE_LINEA[linea.tipo]],
        lineWidth: 1,
        lineStyle: linea.tipo === "ENTRADA" ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${linea.titulo} ${formatMoney(linea.precio, { currency: moneda })}`,
      });
    }

    grafico.timeScale().fitContent();

    const observadorDeTamano = new ResizeObserver((entradas) => {
      const primera = entradas[0];
      if (!primera) return;
      grafico.resize(primera.contentRect.width, ALTO_GRAFICO);
    });
    observadorDeTamano.observe(contenedor);

    return () => {
      observadorDeTamano.disconnect();
      grafico.remove();
    };
  }, [velas, operaciones, posicion, segundosPorVela, moneda, versionTema]);

  // Un párrafo y no el contenedor vacío: un rectángulo con ejes y sin velas
  // parece un gráfico roto, y lo que pasa es que no hay datos que pintar.
  if (velas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No han llegado velas del mercado para este bot, así que no hay gráfico que dibujar. Suele
        ser un corte momentáneo de la API pública de Coinbase o un producto que ésta no sirve;
        vuelve a cargar la página en un rato.
      </p>
    );
  }

  const flechas = textoDeFlechas(direccionPorDefecto);

  return (
    <div className="flex flex-col gap-2">
      <div ref={contenedorRef} className="w-full" style={{ height: ALTO_GRAFICO }} />

      {/* Leyenda mínima: un renglón de texto pequeño, no un panel. Las
          muestras de color salen de los mismos tokens que lee el canvas, así
          que dicen la verdad en cualquier paleta. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-primary" />
          Entrada: {flechas.entrada}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-warning" />
          Salida: {flechas.salida}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 border-t border-dashed border-negative" />
          Stop de la posición abierta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-4 border-t border-dashed border-positive" />
          Objetivo de la posición abierta
        </span>
        {direccionPorDefecto === undefined && (
          <span>
            En un largo la entrada apunta hacia arriba y la salida hacia abajo; en un corto, al
            revés.
          </span>
        )}
      </p>
    </div>
  );
}
