"use client";

import { ArrowLeft, Check, Loader2, PartyPopper, X } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  closeSurvey,
  saveSurveyStep,
  type SurveyStepInput,
} from "@/app/(dashboard)/trades/survey-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatSignedMoney, pnlColorClass } from "@/lib/format";
import { MISTAKE_CODES, MISTAKE_META, type MistakeCode } from "@/lib/journal/mistakes";
import {
  firstUnanswered,
  isAnswered,
  nextStep,
  previousStep,
  stepById,
  stepIndex,
  SURVEY_EMOTIONS,
  SURVEY_STEP_IDS,
  SURVEY_TOTAL,
  surveySummary,
  type SurveyAnswers,
  type SurveyStepId,
  type SurveyTrade,
} from "@/lib/journal/survey";
import { cn } from "@/lib/utils";

/**
 * La encuesta del cierre: una pregunta en pantalla y nada más.
 *
 * El diario completo lleva aquí desde el principio y casi no se rellenaba.
 * No es pereza: son dieciséis campos vacíos que aparecen cuando ya has
 * cerrado y te ibas, y ver dieciséis huecos a la vez es exactamente lo que
 * hace cerrar la pestaña. Así que lo que cambia no es qué se guarda -- son
 * las columnas de siempre -- sino cómo se pregunta.
 *
 * Las decisiones que hacen que se conteste:
 *
 * - **Una pregunta a la vez**, con la siguiente escondida. Saber que quedan
 *   cuatro es distinto de tener las cinco delante.
 * - **Se responde tocando.** Cuatro de las cinco son botones; sólo la última
 *   pide escribir, y también se puede saltar.
 * - **Cada respuesta se guarda al instante.** Se puede cerrar en la tercera
 *   sin perder las dos primeras, que es lo que permite decir «ahora no» sin
 *   que eso signifique tirar lo hecho.
 * - **Las notas avanzan solas.** Tocar «Casi todo» y que la pregunta cambie
 *   sin un segundo clic es la diferencia entre cinco toques y diez.
 * - **Teclado**: 1-5 elige nota, Enter avanza, Esc cierra. Para quien la
 *   conteste todos los días, esto la deja en tres segundos.
 * - **Cerrarla no es un fracaso.** No vuelve a salir sola para esa operación,
 *   y desde la ficha se puede reabrir cuando apetezca.
 */

/** Lo que se tarda en ver que la elección se marcó, antes de pasar a la siguiente. */
const ESPERA_AVANCE_MS = 260;

const GRUPOS = ["ENTRADA", "GESTIÓN", "SALIDA", "DISCIPLINA"] as const;

type Pantalla = SurveyStepId | "fin";

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
  const [answers, setAnswers] = useState<SurveyAnswers>(trade.answers);
  const [pantalla, setPantalla] = useState<Pantalla>(() => firstUnanswered(trade.answers));
  const [guardando, startSaving] = useTransition();
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    };
  }, []);

  const guardar = useCallback(
    (input: SurveyStepInput) => {
      startSaving(async () => {
        const { error } = await saveSurveyStep(trade.id, input);
        // Se avisa pero no se revierte: lo contestado sigue en pantalla y se
        // vuelve a mandar al pasar de pregunta. Borrar la respuesta de alguien
        // porque falló la red es peor que guardarla tarde.
        if (error) toast.error(error);
      });
    },
    [trade.id],
  );

  const cerrar = useCallback(
    (completada: boolean) => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      onClose();
      // Sin esperar: la encuesta desaparece al instante y la marca de cerrada
      // viaja por detrás. Que el botón de cerrar tarde medio segundo es lo
      // único que no se le perdona a un cuadro que sale solo.
      void closeSurvey(trade.id, { completada });
    },
    [onClose, trade.id],
  );

  const avanzar = useCallback((desde: SurveyStepId) => {
    setPantalla(nextStep(desde) ?? "fin");
  }, []);

  const responderNota = useCallback(
    (paso: "plan" | "entrada", valor: number) => {
      setAnswers((previas) => ({ ...previas, [paso]: valor }));
      guardar(paso === "plan" ? { step: "plan", rating: valor } : { step: "entrada", rating: valor });
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => avanzar(paso), ESPERA_AVANCE_MS);
    },
    [avanzar, guardar],
  );

  const alternarEmocion = useCallback((emocion: string) => {
    setAnswers((previas) => ({
      ...previas,
      animo: previas.animo.includes(emocion)
        ? previas.animo.filter((e) => e !== emocion)
        : [...previas.animo, emocion],
    }));
  }, []);

  const alternarError = useCallback((code: MistakeCode) => {
    setAnswers((previas) => ({
      ...previas,
      errores: previas.errores.includes(code)
        ? previas.errores.filter((c) => c !== code)
        : [...previas.errores, code],
    }));
  }, []);

  /**
   * «Ninguno», que no es lo mismo que saltar.
   *
   * Sin este botón, no haber sentido nada raro y no querer contestar se
   * escriben igual -- pulsando «Saltar» -- y luego no hay forma de saber
   * cuál de las dos fue. Además vacía lo que hubiera marcado: es la manera
   * de desdecirse sin ir quitando marcas una a una.
   */
  const responderNinguno = useCallback(
    (paso: "animo" | "errores") => {
      if (paso === "animo") {
        setAnswers((previas) => ({ ...previas, animo: [] }));
        guardar({ step: "animo", emotions: [] });
      } else {
        setAnswers((previas) => ({ ...previas, errores: [] }));
        guardar({ step: "errores", mistakes: [] });
      }
      avanzar(paso);
    },
    [avanzar, guardar],
  );

  /** Guarda lo de esta pregunta y pasa a la siguiente. */
  const continuar = useCallback(
    (desde: SurveyStepId) => {
      if (desde === "animo") guardar({ step: "animo", emotions: answers.animo });
      if (desde === "errores") guardar({ step: "errores", mistakes: answers.errores });
      if (desde === "leccion") guardar({ step: "leccion", text: answers.leccion });
      avanzar(desde);
    },
    [answers.animo, answers.errores, answers.leccion, avanzar, guardar],
  );

  // Teclado. Se registra en cada cambio de pantalla a propósito: así el
  // manejador siempre sabe en qué pregunta está, sin guardarla en un ref.
  useEffect(() => {
    function alPulsar(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cerrar(pantalla === "fin");
        return;
      }
      if (pantalla === "fin") return;

      // Escribiendo la lección, los números son números y Enter es un salto
      // de línea. Secuestrarlos haría que la última pregunta no se pudiera
      // contestar.
      const destino = event.target as HTMLElement | null;
      const escribiendo =
        destino?.tagName === "TEXTAREA" ||
        destino?.tagName === "INPUT" ||
        destino?.isContentEditable === true;

      const paso = stepById(pantalla);
      if (!escribiendo && paso.tipo === "escala" && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        responderNota(paso.id as "plan" | "entrada", Number(event.key));
        return;
      }
      if (event.key === "Enter" && (!escribiendo || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        continuar(pantalla);
      }
    }

    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [pantalla, cerrar, continuar, responderNota]);

  const indice = pantalla === "fin" ? SURVEY_TOTAL : stepIndex(pantalla);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => cerrar(pantalla === "fin")}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Encuesta de cierre de la operación"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
      >
        <Cabecera
          trade={trade}
          indice={indice}
          variante={variante}
          guardando={guardando}
          onCerrar={() => cerrar(pantalla === "fin")}
        />

        {pantalla === "fin" ? (
          <Final answers={answers} tradeId={trade.id} onCerrar={() => cerrar(true)} />
        ) : (
          <Pregunta
            pantalla={pantalla}
            answers={answers}
            onNota={responderNota}
            onEmocion={alternarEmocion}
            onError={alternarError}
            onNinguno={responderNinguno}
            onLeccion={(texto) => setAnswers((previas) => ({ ...previas, leccion: texto }))}
            onAtras={() => {
              const anterior = previousStep(pantalla);
              if (anterior) setPantalla(anterior);
            }}
            onContinuar={() => continuar(pantalla)}
          />
        )}
      </div>
    </div>
  );
}

function Cabecera({
  trade,
  indice,
  variante,
  guardando,
  onCerrar,
}: {
  trade: SurveyTrade;
  indice: number;
  variante: "automatica" | "manual";
  guardando: boolean;
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

        <div className="flex shrink-0 items-center gap-2">
          {guardando ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="guardando" />
          ) : null}
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar la encuesta"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* El avance, en tramos y no en porcentaje: cinco tramos se cuentan de
          un vistazo y «40 %» hay que traducirlo. */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {SURVEY_STEP_IDS.map((id, i) => (
            <span
              key={id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < indice ? "bg-primary" : i === indice ? "bg-primary/40" : "bg-border",
              )}
            />
          ))}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {indice >= SURVEY_TOTAL ? "Listo" : `${indice + 1} de ${SURVEY_TOTAL}`}
        </span>
      </div>
    </div>
  );
}

function Pregunta({
  pantalla,
  answers,
  onNota,
  onEmocion,
  onError,
  onNinguno,
  onLeccion,
  onAtras,
  onContinuar,
}: {
  pantalla: SurveyStepId;
  answers: SurveyAnswers;
  onNota: (paso: "plan" | "entrada", valor: number) => void;
  onEmocion: (emocion: string) => void;
  onError: (code: MistakeCode) => void;
  onNinguno: (paso: "animo" | "errores") => void;
  onLeccion: (texto: string) => void;
  onAtras: () => void;
  onContinuar: () => void;
}) {
  const paso = stepById(pantalla);
  const contestada = isAnswered(pantalla, answers);
  const hayAnterior = previousStep(pantalla) !== null;
  const ultima = nextStep(pantalla) === null;

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <div>
        <h2 className="text-balance text-lg font-semibold leading-snug">{paso.pregunta}</h2>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">{paso.ayuda}</p>
      </div>

      {paso.tipo === "escala" ? (
        <div className="flex flex-col gap-1.5">
          {paso.opciones.map((opcion) => {
            const elegida = answers[paso.id as "plan" | "entrada"] === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => onNota(paso.id as "plan" | "entrada", opcion.valor)}
                aria-pressed={elegida}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  elegida
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40 hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums transition-colors",
                    elegida
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
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
      ) : null}

      {paso.tipo === "chips" && paso.fuente === "emociones" ? (
        <div className="flex flex-wrap gap-1.5">
          {SURVEY_EMOTIONS.map((emocion) => (
            <Chip
              key={emocion}
              activo={answers.animo.includes(emocion)}
              onClick={() => onEmocion(emocion)}
            >
              {emocion}
            </Chip>
          ))}
        </div>
      ) : null}

      {paso.tipo === "chips" && paso.fuente === "errores" ? (
        <div className="flex flex-col gap-3">
          {GRUPOS.map((grupo) => {
            const codigos = MISTAKE_CODES.filter((c) => MISTAKE_META[c].group === grupo);
            if (codigos.length === 0) return null;
            return (
              <div key={grupo} className="flex flex-col gap-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{grupo}</p>
                <div className="flex flex-wrap gap-1.5">
                  {codigos.map((code) => (
                    <Chip
                      key={code}
                      activo={answers.errores.includes(code)}
                      // La definición a mano, para que el mismo fallo reciba la
                      // misma etiqueta el mes que viene y las cuentas signifiquen algo.
                      title={MISTAKE_META[code].description}
                      onClick={() => onError(code)}
                    >
                      {MISTAKE_META[code].label}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Después de la lista y con el borde punteado: es una salida, no una
          opción más. Decir «ninguno» no es lo mismo que saltar, y sin este
          botón las dos cosas se escriben igual y luego no se distinguen. */}
      {paso.tipo === "chips" ? (
        <button
          type="button"
          onClick={() => onNinguno(paso.fuente === "emociones" ? "animo" : "errores")}
          className="w-fit rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-accent/50 hover:text-foreground"
        >
          {paso.ninguno}
        </button>
      ) : null}

      {paso.tipo === "texto" ? (
        <Textarea
          value={answers.leccion}
          onChange={(event) => onLeccion(event.target.value)}
          placeholder={paso.marcador}
          maxLength={paso.maximo}
          rows={4}
          autoFocus
        />
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        {hayAnterior ? (
          <Button type="button" variant="ghost" size="sm" onClick={onAtras}>
            <ArrowLeft className="size-3.5" aria-hidden />
            Atrás
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {/* «Saltar» y «Siguiente» son el mismo botón con dos nombres, porque
              son la misma acción: pasar. Llamarlo «saltar» cuando no has
              contestado quita la sensación de estar dejando algo a medias. */}
          <Button type="button" size="sm" variant={contestada ? "default" : "ghost"} onClick={onContinuar}>
            {contestada ? (ultima ? "Terminar" : "Siguiente") : ultima ? "Terminar" : "Saltar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  activo,
  title,
  onClick,
  children,
}: {
  activo: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={title}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        activo
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Lo contestado, al acabar.
 *
 * Enseñarlo no es una celebración vacía: es lo que convierte cinco toques en
 * algo que se ha dicho, y la última oportunidad de ver que el 2 que pusiste
 * en «plan» querías que fuera un 4. Desde aquí se va a la ficha, que es donde
 * se corrige y donde está todo lo demás.
 */
function Final({
  answers,
  tradeId,
  onCerrar,
}: {
  answers: SurveyAnswers;
  tradeId: string;
  onCerrar: () => void;
}) {
  const lineas = surveySummary(answers);

  return (
    <div className="flex flex-col gap-4 px-5 py-6">
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
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href={`/trades/${tradeId}`}>Ver la operación</Link>
        </Button>
        <Button type="button" size="sm" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
