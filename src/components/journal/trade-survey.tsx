"use client";

import { ArrowUpRight, PartyPopper, Target, X } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { closeSurvey } from "@/app/(dashboard)/trades/survey-actions";
import { Button } from "@/components/ui/button";
import { Encuesta } from "@/core/encuesta/encuesta";
import { resumen, type Paso, type Respuesta, type Respuestas } from "@/core/encuesta/pasos";
import { formatSignedMoney, pnlColorClass } from "@/lib/format";
import type { MistakeCode } from "@/lib/journal/mistakes";
import type { SurveyStepInput } from "@/lib/journal/survey-store";
import {
  aRespuestas,
  deRespuestas,
  pasosDeLaEncuesta,
  SURVEY_LABELS,
  type SurveyTrade,
} from "@/lib/journal/survey";
import { cn } from "@/lib/utils";

/**
 * La encuesta del cierre de una operación.
 *
 * El recorrido lo pone `core/encuesta`, que es el mismo que usa el resto de
 * módulos; lo de aquí es lo que sólo vale para una operación: el cuadro que
 * sale solo, la cabecera que dice de qué operación se habla, la salida a su
 * ficha y qué columna recibe cada respuesta.
 *
 * Cerrarla no es un fracaso: no vuelve a salir sola para esa operación, y
 * desde la ficha se puede reabrir cuando apetezca.
 */

export function TradeSurvey({
  trade,
  onClose,
  /** La abierta a mano desde la ficha no necesita presentarse como una novedad. */
  variante = "automatica",
}: {
  trade: SurveyTrade;
  onClose: () => void;
  variante?: "automatica" | "manual";
}) {
  const [respuestas, setRespuestas] = useState<Respuestas>(() => aRespuestas(trade.answers));
  const [guardando, startSaving] = useTransition();
  const terminadaRef = useRef(false);

  // Las preguntas de *esta* operación: las de siempre, con la del plan delante
  // cuando había uno esperando. Memorizadas porque la encuesta las usa como
  // identidad para saber por dónde ibas.
  const pasos = useMemo(() => pasosDeLaEncuesta(trade.plan !== null), [trade.plan]);

  const cambiar = useCallback((id: string, valor: Respuesta) => {
    setRespuestas((previas) => ({ ...previas, [id]: valor }));
  }, []);

  const guardar = useCallback(
    (id: string, valor: Respuesta) => {
      const entrada = entradaDelPaso(id, valor, trade.plan?.id ?? null);
      if (!entrada) return;
      startSaving(async () => {
        try {
          // Un `fetch` y no una Server Action: una acción refresca la ruta
          // actual al terminar, el panel vuelve a buscar qué operación
          // encuestar, y al contestar «¿cómo estabas?» ésta ya cuenta como
          // apuntada -- así que el cuadro se desmontaba a media encuesta.
          const res = await fetch(`/api/trades/${trade.id}/survey`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(entrada),
          });
          const data = (await res.json()) as { error: string | null };
          // Se avisa pero no se revierte: lo contestado sigue en pantalla y se
          // vuelve a mandar al pasar de pregunta. Borrar la respuesta de
          // alguien porque falló la red es peor que guardarla tarde.
          if (data.error) toast.error(data.error);
        } catch {
          toast.error("No se pudo guardar la respuesta.");
        }
      });
    },
    [trade.id, trade.plan?.id],
  );

  const cerrar = useCallback(() => {
    onClose();
    // Sin esperar: la encuesta desaparece al instante y la marca de cerrada
    // viaja por detrás. Que el botón de cerrar tarde medio segundo es lo
    // único que no se le perdona a un cuadro que sale solo.
    void closeSurvey(trade.id, { completada: terminadaRef.current });
  }, [onClose, trade.id]);

  const verLaOperacion = (
    <Button type="button" variant="ghost" size="sm" asChild>
      <Link href={`/trades/${trade.id}`}>
        Ver la operación
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </Button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={cerrar}
      onKeyDown={(event) => {
        if (event.key === "Escape") cerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Encuesta de cierre de la operación"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:max-h-[88dvh] sm:rounded-2xl"
      >
        {/* Fuera de la encuesta y no como encabezado suyo: ocupa el ancho
            entero del cuadro, y meterla dentro obligaría a deshacer con
            márgenes negativos el relleno que la encuesta necesita. */}
        <Cabecera trade={trade} variante={variante} onCerrar={cerrar} />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <Encuesta
            pasos={pasos}
            respuestas={respuestas}
            onCambio={cambiar}
            onGuardar={guardar}
            onTerminar={() => {
              terminadaRef.current = true;
            }}
            guardando={guardando}
            pie={verLaOperacion}
            bajoLaPregunta={<ElPlan plan={trade.plan} respuestas={respuestas} />}
            final={
              <Final
                pasos={pasos}
                respuestas={respuestas}
                verLaOperacion={verLaOperacion}
                onCerrar={cerrar}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

/** Qué mandarle al servidor por cada respuesta, ya en el tipo que espera. */
function entradaDelPaso(id: string, valor: Respuesta, planId: string | null): SurveyStepInput | null {
  if (id === "plan_seguido") {
    // Sin plan no hay nada que unir, y mandarlo sería inventarse un enlace.
    if (!planId) return null;
    const texto = typeof valor === "string" ? valor : "";
    return { step: "plan_seguido", planId, value: texto === "SI" || texto === "NO" ? texto : "" };
  }
  if (id === "setup") return { step: "setup", grade: typeof valor === "string" ? valor : "" };
  if (id === "plan" && typeof valor === "number") return { step: "plan", rating: valor };
  if (id === "entrada" && typeof valor === "number") return { step: "entrada", rating: valor };
  if (id === "animo") {
    return { step: "animo", emotions: Array.isArray(valor) ? valor.map(String) : [] };
  }
  if (id === "errores") {
    const codigos = deRespuestas({ errores: valor }).errores as MistakeCode[];
    return { step: "errores", mistakes: codigos };
  }
  if (id === "leccion") return { step: "leccion", text: typeof valor === "string" ? valor : "" };
  return null;
}

/**
 * El plan que había escrito, debajo de la pregunta que pregunta por él.
 *
 * Sin esto, «¿es ésta la que planificaste?» es un test de memoria, que es
 * exactamente el problema que planificar por escrito venía a resolver. Con el
 * plan delante la pregunta se contesta mirando, no recordando.
 *
 * Desaparece en cuanto se pasa de pregunta: en «¿qué tal era el setup?» ya no
 * pinta nada, y dejarlo sería una caja fija ocupando sitio en todas.
 */
function ElPlan({
  plan,
  respuestas,
}: {
  plan: SurveyTrade["plan"];
  respuestas: Respuestas;
}) {
  if (!plan || !plan.resumen) return null;
  // Contestada la pregunta, el plan deja de hacer falta.
  if (respuestas.plan_seguido) return null;

  return (
    <p className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
      <Target className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="text-muted-foreground">Lo que escribiste: </span>
        <span className="font-medium">{plan.resumen}</span>
      </span>
    </p>
  );
}

function Cabecera({
  trade,
  variante,
  onCerrar,
}: {
  trade: SurveyTrade;
  variante: "automatica" | "manual";
  onCerrar: () => void;
}) {
  const cerrada = DateTime.fromISO(trade.closedAt).toRelative({ locale: "es" });

  return (
    <div className="border-b border-border bg-gradient-to-br from-primary/10 via-card to-card px-5 pb-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {variante === "manual" ? "La encuesta de esta operación" : "Se cerró una operación"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{trade.productId}</span>
            <span>{trade.direction === "LONG" ? "Largo" : "Corto"}</span>
            {trade.netPnl !== null ? (
              <span className={cn("font-medium tabular-nums", pnlColorClass(trade.netPnl))}>
                {formatSignedMoney(trade.netPnl)}
              </span>
            ) : null}
            {cerrada ? <span>· {cerrada}</span> : null}
          </p>
        </div>

        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la encuesta"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Lo contestado, al acabar.
 *
 * No es una celebración vacía: convierte media docena de toques en algo que se
 * ha dicho, y es la última oportunidad de ver que el 2 que pusiste en «plan»
 * querías que fuera un 4. Desde aquí se va a la ficha, que es donde se
 * corrige y donde está todo lo demás.
 */
function Final({
  pasos,
  respuestas,
  verLaOperacion,
  onCerrar,
}: {
  pasos: Paso[];
  respuestas: Respuestas;
  verLaOperacion: React.ReactNode;
  onCerrar: () => void;
}) {
  const lineas = resumen(pasos, respuestas, SURVEY_LABELS);

  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-positive/15 text-positive">
          <PartyPopper className="size-4.5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold leading-snug">
            {lineas.length > 0 ? "Apuntada" : "Hasta la próxima"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {lineas.length > 0
              ? "Dentro de seis meses esto es lo que te va a decir por qué hiciste lo que hiciste."
              : "No has contestado nada, y no pasa nada. Sigue en el diario cuando quieras."}
          </p>
        </div>
      </div>

      {lineas.length > 0 ? (
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm">
          {lineas.map((linea) => (
            <div key={linea.etiqueta} className="flex gap-2">
              <dt className="w-20 shrink-0 text-xs text-muted-foreground">{linea.etiqueta}</dt>
              <dd className="min-w-0 flex-1 text-pretty">{linea.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {verLaOperacion}
        <Button type="button" size="sm" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
