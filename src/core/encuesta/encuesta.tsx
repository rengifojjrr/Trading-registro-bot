"use client";

import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  estaContestado,
  pasoAnterior,
  pasoPorId,
  primeraSinContestar,
  siguientePaso,
  indiceDe,
  type Paso,
  type Respuesta,
  type Respuestas,
} from "./pasos";

/**
 * La encuesta: una pregunta en pantalla y nada más.
 *
 * El formulario largo de cualquier módulo -- dieciséis campos del diario, once
 * de una noche, nueve de una comida -- se cierra sin rellenar por un motivo
 * que no es pereza: ver todos los huecos vacíos a la vez desanima antes de
 * empezar. Esto pregunta de una en una y guarda cada respuesta al contestarla,
 * así que abandonar a media encuesta no cuesta nada.
 *
 * Lo que hace que se conteste, y que vale igual para dormir que para operar:
 *
 * - **Una pregunta a la vez**, con la siguiente escondida. Saber que quedan
 *   cuatro es distinto de tener las cinco delante.
 * - **Se responde tocando.** Las escalas y las listas cerradas son botones; el
 *   teclado sólo aparece cuando de verdad hay que escribir.
 * - **Las respuestas de una sola opción avanzan solas.** Tocar «Casi todo» y
 *   que la pregunta cambie sin un segundo clic es la diferencia entre cinco
 *   toques y diez.
 * - **Cada respuesta se guarda al instante**, no al final. Un formulario que
 *   sólo guarda al final convierte cualquier interrupción en trabajo perdido,
 *   y trabajo perdido una vez es un formulario que ya no se abre más.
 * - **Teclado**: 1-9 elige en una escala, Enter avanza, Esc cierra donde haya
 *   dónde cerrar. Escribiendo, los números son números.
 * - **Saltar no es un fracaso.** El botón dice «Saltar» mientras no hayas
 *   contestado y «Siguiente» cuando sí.
 *
 * El color de acento lo pone cada módulo con su custom property (`--mod-sleep`
 * y compañía), que es como el resto de la aplicación distingue un módulo de
 * otro sin que cada uno tenga su propio diseño.
 */

/** Lo que se tarda en ver que la elección se marcó, antes de pasar a la siguiente. */
const ESPERA_AVANCE_MS = 260;

export function Encuesta({
  pasos,
  respuestas,
  onCambio,
  onGuardar,
  onTerminar,
  acento,
  guardando = false,
  encabezado,
  bajoLaPregunta,
  pie,
  final,
  pasoInicial,
}: {
  pasos: Paso[];
  respuestas: Respuestas;
  /** Cada cambio en la pantalla, para que quien llama mande sobre el estado. */
  onCambio: (id: string, valor: Respuesta) => void;
  /** Al pasar de pregunta: el momento de escribirlo donde toque. */
  onGuardar: (id: string, valor: Respuesta) => void;
  /** Al pasar de la última. Null deja la encuesta sin pantalla final. */
  onTerminar?: () => void;
  /** Custom property del módulo, p. ej. "--mod-sleep". */
  acento?: string;
  guardando?: boolean;
  /** Encima de la barra de avance: de qué va esta encuesta. */
  encabezado?: ReactNode;
  /** Entre la ayuda y las respuestas: un dato en vivo, un aviso. */
  bajoLaPregunta?: ReactNode;
  /** A la izquierda del pie, junto a «Atrás». */
  pie?: ReactNode;
  /** La pantalla de después de la última pregunta. */
  final?: ReactNode;
  /** Por dónde abrir. Por defecto, la primera sin contestar. */
  pasoInicial?: string;
}) {
  const [pantalla, setPantalla] = useState<string>(
    () => pasoInicial ?? primeraSinContestar(pasos, respuestas),
  );
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    };
  }, []);

  const terminado = pantalla === "";

  const avanzar = useCallback(
    (desde: string) => {
      const siguiente = siguientePaso(pasos, desde);
      if (siguiente) {
        setPantalla(siguiente);
        return;
      }
      // Sin pantalla final, la última pregunta es el final: quedarse en ella
      // es más honesto que enseñar un hueco.
      if (final || onTerminar) setPantalla("");
      onTerminar?.();
    },
    [pasos, final, onTerminar],
  );

  /** Contesta, guarda y pasa: lo que hace una opción única al tocarla. */
  const responderYAvanzar = useCallback(
    (id: string, valor: Respuesta) => {
      onCambio(id, valor);
      onGuardar(id, valor);
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => avanzar(id), ESPERA_AVANCE_MS);
    },
    [avanzar, onCambio, onGuardar],
  );

  const continuar = useCallback(
    (id: string) => {
      onGuardar(id, respuestas[id] ?? null);
      avanzar(id);
    },
    [avanzar, onGuardar, respuestas],
  );

  const responderNinguno = useCallback(
    (paso: Paso) => {
      const vacio: Respuesta = paso.tipo === "chips" && paso.multiple ? [] : "";
      onCambio(paso.id, vacio);
      onGuardar(paso.id, vacio);
      avanzar(paso.id);
    },
    [avanzar, onCambio, onGuardar],
  );

  // Teclado. Se registra en cada cambio de pantalla a propósito: así el
  // manejador siempre sabe en qué pregunta está, sin guardarla en un ref.
  useEffect(() => {
    if (terminado) return;

    function alPulsar(event: KeyboardEvent) {
      const destino = event.target as HTMLElement | null;
      const escribiendo =
        destino?.tagName === "TEXTAREA" ||
        destino?.tagName === "INPUT" ||
        destino?.isContentEditable === true;

      const paso = pasoPorId(pasos, pantalla);

      if (!escribiendo && paso.tipo === "escala" && /^[0-9]$/.test(event.key)) {
        const opcion = paso.opciones.find((o) => o.valor === Number(event.key));
        if (opcion) {
          event.preventDefault();
          responderYAvanzar(paso.id, opcion.valor);
          return;
        }
      }

      // Escribiendo, Enter es un salto de línea y no un «siguiente»; con la
      // tecla de comando sí avanza, que es lo que espera quien escribe rápido.
      if (event.key === "Enter" && (!escribiendo || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        continuar(pantalla);
      }
    }

    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [pantalla, pasos, terminado, responderYAvanzar, continuar]);

  const indice = terminado ? pasos.length : indiceDe(pasos, pantalla);

  return (
    <div className="flex flex-col">
      {encabezado}

      <Avance pasos={pasos} indice={indice} acento={acento} guardando={guardando} />

      {terminado ? (
        final
      ) : (
        <Pregunta
          paso={pasoPorId(pasos, pantalla)}
          respuestas={respuestas}
          acento={acento}
          bajoLaPregunta={bajoLaPregunta}
          pie={pie}
          hayAnterior={pasoAnterior(pasos, pantalla) !== null}
          esUltima={siguientePaso(pasos, pantalla) === null}
          onCambio={onCambio}
          onResponderYAvanzar={responderYAvanzar}
          onNinguno={responderNinguno}
          onAtras={() => {
            const anterior = pasoAnterior(pasos, pantalla);
            if (anterior) setPantalla(anterior);
          }}
          onContinuar={() => continuar(pantalla)}
        />
      )}
    </div>
  );
}

/**
 * Por dónde vas.
 *
 * En tramos y no en porcentaje: cinco tramos se cuentan de un vistazo y
 * «40 %» hay que traducirlo.
 */
function Avance({
  pasos,
  indice,
  acento,
  guardando,
}: {
  pasos: Paso[];
  indice: number;
  acento?: string;
  guardando: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pb-4">
      <div className="flex flex-1 gap-1" aria-hidden>
        {pasos.map((paso, i) => (
          <span
            key={paso.id}
            className={cn("h-1 flex-1 rounded-full transition-colors", i > indice && "bg-border")}
            style={
              i <= indice && acento
                ? { backgroundColor: `var(${acento})`, opacity: i === indice ? 0.45 : 1 }
                : undefined
            }
          />
        ))}
      </div>
      {guardando ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="guardando" />
      ) : null}
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {indice >= pasos.length ? "Listo" : `${indice + 1} de ${pasos.length}`}
      </span>
    </div>
  );
}

function Pregunta({
  paso,
  respuestas,
  acento,
  bajoLaPregunta,
  pie,
  hayAnterior,
  esUltima,
  onCambio,
  onResponderYAvanzar,
  onNinguno,
  onAtras,
  onContinuar,
}: {
  paso: Paso;
  respuestas: Respuestas;
  acento?: string;
  bajoLaPregunta?: ReactNode;
  pie?: ReactNode;
  hayAnterior: boolean;
  esUltima: boolean;
  onCambio: (id: string, valor: Respuesta) => void;
  onResponderYAvanzar: (id: string, valor: Respuesta) => void;
  onNinguno: (paso: Paso) => void;
  onAtras: () => void;
  onContinuar: () => void;
}) {
  const contestada = estaContestado(paso, respuestas);
  const valor = respuestas[paso.id];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-balance text-lg font-semibold leading-snug">{paso.pregunta}</h2>
        {paso.ayuda ? (
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">{paso.ayuda}</p>
        ) : null}
      </div>

      {bajoLaPregunta}

      {paso.tipo === "escala" ? (
        <Escala
          paso={paso}
          valor={typeof valor === "number" ? valor : null}
          acento={acento}
          onElegir={(v) => onResponderYAvanzar(paso.id, v)}
        />
      ) : null}

      {paso.tipo === "chips" ? (
        <Chips
          paso={paso}
          valor={valor}
          acento={acento}
          onMultiple={(v) => onCambio(paso.id, v)}
          onUnica={(v) => onResponderYAvanzar(paso.id, v)}
        />
      ) : null}

      {paso.tipo === "hora" ? (
        <Hora
          paso={paso}
          valor={typeof valor === "string" ? valor : ""}
          acento={acento}
          onCambio={(v) => onCambio(paso.id, v)}
        />
      ) : null}

      {paso.tipo === "texto" ? (
        <Textarea
          value={typeof valor === "string" ? valor : ""}
          onChange={(event) => onCambio(paso.id, event.target.value)}
          placeholder={paso.marcador}
          maxLength={paso.maximo}
          rows={paso.lineas ?? 4}
          autoFocus
        />
      ) : null}

      {paso.tipo === "linea" ? (
        <Input
          value={typeof valor === "string" ? valor : ""}
          onChange={(event) => onCambio(paso.id, event.target.value)}
          placeholder={paso.marcador}
          maxLength={paso.maximo}
          autoComplete="off"
          autoFocus
        />
      ) : null}

      {/* Después de la lista y con el borde punteado: es una salida, no una
          opción más. */}
      {paso.ninguno ? (
        <button
          type="button"
          onClick={() => onNinguno(paso)}
          className="w-fit rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-accent/50 hover:text-foreground"
        >
          {paso.ninguno}
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {hayAnterior ? (
          <Button type="button" variant="ghost" size="sm" onClick={onAtras}>
            <ArrowLeft className="size-3.5" aria-hidden />
            Atrás
          </Button>
        ) : null}

        {pie}

        {/* «Saltar» y «Siguiente» son el mismo botón con dos nombres, porque
            son la misma acción: pasar. Llamarlo «saltar» cuando no has
            contestado quita la sensación de estar dejando algo a medias. */}
        <Button
          type="button"
          size="sm"
          variant={contestada ? "default" : "ghost"}
          onClick={onContinuar}
          className="ml-auto"
          style={contestada && acento ? { backgroundColor: `var(${acento})` } : undefined}
        >
          {esUltima ? "Terminar" : contestada ? "Siguiente" : "Saltar"}
        </Button>
      </div>
    </div>
  );
}

function Escala({
  paso,
  valor,
  acento,
  onElegir,
}: {
  paso: Extract<Paso, { tipo: "escala" }>;
  valor: number | null;
  acento?: string;
  onElegir: (valor: number) => void;
}) {
  // Con detalle, una fila por opción y se lee; sin detalle son notas de una
  // escala larga (0 a 10) y en fila caben de un vistazo.
  const enFila = paso.opciones.every((o) => !o.detalle);

  if (enFila) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {paso.opciones.map((opcion) => {
          const elegida = valor === opcion.valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              onClick={() => onElegir(opcion.valor)}
              aria-pressed={elegida}
              className={cn(
                "size-10 rounded-full border text-sm font-medium tabular-nums transition-colors",
                elegida
                  ? "border-transparent text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
              style={elegida ? { backgroundColor: `var(${acento ?? "--primary"})` } : undefined}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {paso.opciones.map((opcion) => {
        const elegida = valor === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => onElegir(opcion.valor)}
            aria-pressed={elegida}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
              elegida ? "bg-accent/60" : "border-border hover:border-foreground/30 hover:bg-accent/40",
            )}
            style={elegida ? { borderColor: `var(${acento ?? "--primary"})` } : undefined}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums transition-colors",
                elegida ? "border-transparent text-background" : "border-border text-muted-foreground",
              )}
              style={elegida ? { backgroundColor: `var(${acento ?? "--primary"})` } : undefined}
            >
              {elegida ? <Check className="size-3.5" aria-hidden /> : opcion.valor}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{opcion.etiqueta}</span>
              <span className="block text-xs text-muted-foreground">{opcion.detalle}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Chips({
  paso,
  valor,
  acento,
  onMultiple,
  onUnica,
}: {
  paso: Extract<Paso, { tipo: "chips" }>;
  valor: Respuesta;
  acento?: string;
  onMultiple: (valor: string[]) => void;
  onUnica: (valor: string) => void;
}) {
  const marcadas = Array.isArray(valor) ? valor : typeof valor === "string" && valor ? [valor] : [];

  function alternar(opcion: string) {
    if (!paso.multiple) {
      // Volver a tocar la elegida la desmarca, pero entonces no se avanza:
      // avanzar al desmarcar dejaría la pregunta en blanco sin quererlo.
      if (marcadas.includes(opcion)) onMultiple([]);
      else onUnica(opcion);
      return;
    }
    onMultiple(
      marcadas.includes(opcion) ? marcadas.filter((o) => o !== opcion) : [...marcadas, opcion],
    );
  }

  const chip = (valorOpcion: string, etiqueta: string, detalle?: string) => {
    const on = marcadas.includes(valorOpcion);
    return (
      <button
        key={valorOpcion}
        type="button"
        onClick={() => alternar(valorOpcion)}
        aria-pressed={on}
        title={detalle}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          on
            ? "bg-accent text-foreground"
            : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
        )}
        style={on ? { borderColor: `var(${acento ?? "--primary"})` } : undefined}
      >
        {etiqueta}
      </button>
    );
  };

  if (paso.grupos) {
    return (
      <div className="flex flex-col gap-3">
        {paso.grupos.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{grupo.titulo}</p>
            <div className="flex flex-wrap gap-1.5">
              {grupo.opciones.map((o) => chip(o.valor, o.etiqueta, o.detalle))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">{(paso.opciones ?? []).map((o) => chip(o, o))}</div>
  );
}

function Hora({
  paso,
  valor,
  acento,
  onCambio,
}: {
  paso: Extract<Paso, { tipo: "hora" }>;
  valor: string;
  acento?: string;
  onCambio: (valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        type="time"
        value={valor}
        onChange={(event) => onCambio(event.target.value)}
        className="max-w-40 text-lg tabular-nums"
        aria-label={paso.pregunta}
      />
      {/* Tocar «23:00» es una acción; escribirlo en el campo de hora de un
          móvil son cuatro, y a las siete de la mañana esa diferencia decide
          si la noche se apunta o no. */}
      <div className="flex flex-wrap gap-1.5">
        {paso.atajos.map((atajo) => {
          const on = valor === atajo;
          return (
            <button
              key={atajo}
              type="button"
              onClick={() => onCambio(atajo)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors",
                on
                  ? "bg-accent font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
              style={on ? { borderColor: `var(${acento ?? "--primary"})` } : undefined}
            >
              {atajo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
