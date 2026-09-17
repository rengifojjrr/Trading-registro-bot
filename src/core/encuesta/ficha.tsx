"use client";

import { Pencil } from "lucide-react";

import { textoDeRespuesta, type Paso, type Respuestas } from "./pasos";

/**
 * Todo lo contestado, y cada línea es un atajo a su pregunta.
 *
 * La pantalla final de una encuesta que se escribe una vez --una noche, una
 * lectura-- es un resumen: se lee y se cierra. Pero hay cosas que se escriben
 * una vez y se **tocan durante semanas**: una tarea baja por sus estados, una
 * pieza de contenido pasa de idea a publicada en dos meses. Para ésas, el
 * final de la encuesta no es el final de nada -- es la pantalla en la que se
 * pasan la vida, y desde la que se hace el cambio de un campo suelto.
 *
 * Así que aquí el resumen es el índice: se toca una línea y se va a esa
 * pregunta. Sin esto, cambiarle la fecha a una tarea cuesta recorrer nueve
 * preguntas, y entonces la encuesta habrá arreglado rellenarla y estropeado lo
 * que de verdad se hace con ella.
 *
 * **Las preguntas sin contestar también salen**, con un guión. Es lo que
 * separa un índice de un resumen de lo hecho: los huecos se ven, y por eso se
 * acaban rellenando.
 *
 * Quien llama decide qué hacer con el salto --normalmente remontar la encuesta
 * con `pasoInicial`, porque la pantalla en la que está es suya.
 */
export function FichaDeRespuestas({
  pasos,
  respuestas,
  etiquetas,
  onIr,
}: {
  pasos: Paso[];
  respuestas: Respuestas;
  /** El nombre corto de cada respuesta. La pregunta entera ocupa tres líneas para decir una. */
  etiquetas: Record<string, string>;
  onIr: (id: string) => void;
}) {
  return (
    <dl className="flex flex-col gap-0.5 rounded-lg border border-border bg-secondary/30 p-1.5 text-sm">
      {pasos.map((paso) => {
        const texto = textoDeRespuesta(paso, respuestas);
        return (
          <button
            key={paso.id}
            type="button"
            onClick={() => onIr(paso.id)}
            className="group flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent/60"
          >
            <dt className="w-24 shrink-0 text-xs text-muted-foreground">
              {etiquetas[paso.id] ?? paso.pregunta}
            </dt>
            <dd
              className={
                texto === null
                  ? "min-w-0 flex-1 text-muted-foreground/60"
                  : "min-w-0 flex-1 whitespace-pre-line text-pretty"
              }
            >
              {/* Recortado: un guion de veinte mil caracteres en una línea de
                  índice tapa el resto de la ficha. Para leerlo entero está su
                  propia pregunta, que es adonde lleva esta línea. */}
              {texto === null ? "--" : recortar(texto)}
            </dd>
            <Pencil
              className="size-3 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </button>
        );
      })}
    </dl>
  );
}

const LARGO_MAXIMO = 180;

function recortar(texto: string): string {
  return texto.length > LARGO_MAXIMO ? `${texto.slice(0, LARGO_MAXIMO).trimEnd()}…` : texto;
}
