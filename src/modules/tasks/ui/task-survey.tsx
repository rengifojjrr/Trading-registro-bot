"use client";

import { Check, ListChecks, Pencil } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Encuesta } from "@/core/encuesta/encuesta";
import {
  contestadas,
  estaContestado,
  primeraSinContestar,
  textoDeRespuesta,
  type Paso,
  type Respuesta,
  type Respuestas,
} from "@/core/encuesta/pasos";
import { IconPicker } from "@/core/ui/icon-picker";
import { saveTaskAnswer } from "@/modules/tasks/actions";
import {
  ETIQUETAS_TAREA,
  pasosDeTarea,
  type ProyectoElegible,
} from "@/modules/tasks/domain/encuesta";
import type { ProjectRow, TaskRow } from "@/modules/tasks/queries";

/**
 * Rellenar una tarea, de una pregunta en una pregunta.
 *
 * Eran diez campos a la vista, que es el muro que nadie rellena. Pero una
 * tarea no se usa como una noche o una lectura --se apunta en un segundo y
 * luego se toca muchas veces--, así que esto hace dos cosas y no una:
 *
 * - **Una tarea recién apuntada abre en la primera pregunta sin contestar.**
 *   Es el camino de quien la capturó con prisa y ahora se sienta a decidir de
 *   qué proyecto es y para cuándo.
 * - **Una tarea ya rellenada abre en su ficha**, con todo lo contestado a la
 *   vista y cada línea saltando a su pregunta. Moverla al viernes no puede
 *   costar recorrer nueve preguntas, y es lo que más se hace con una tarea.
 *
 * Apuntarla sigue siendo un campo y un botón (`ui/new-task.tsx`): eso ya era
 * lo más rápido que podía ser y una encuesta lo haría más lento.
 */
export function TaskSurvey({
  task,
  projects,
  hoy,
}: {
  task: TaskRow;
  projects: ProjectRow[];
  /** El día de hoy en la zona del usuario, desde el que cuentan «Mañana» y compañía. */
  hoy: string;
}) {
  const proyectos = useMemo<ProyectoElegible[]>(
    () => projects.map((p) => ({ id: p.id, name: p.name, icon: p.icon })),
    [projects],
  );

  const pasos = useMemo(() => pasosDeTarea(proyectos, hoy), [proyectos, hoy]);

  const [respuestas, setRespuestas] = useState<Respuestas>(() => respuestasIniciales(task));
  const [icono, setIcono] = useState(task.icon ?? "");
  const [guardando, startSaving] = useTransition();

  /**
   * Por dónde abrir, y a dónde saltar desde la ficha.
   *
   * La cadena vacía es la pantalla final --la ficha--, que es donde abre una
   * tarea que ya está entera: es el estado en el que se pasa la vida, y desde
   * el que se hace el cambio de un campo suelto.
   */
  const [destino, setDestino] = useState<string>(() =>
    pasos.every((p) => estaContestado(p, respuestas)) ? "" : primeraSinContestar(pasos, respuestas),
  );

  const guardar = useCallback(
    (campo: string, valor: Respuesta) => {
      startSaving(async () => {
        const { error } = await saveTaskAnswer(task.id, campo, valor);
        // Se avisa pero no se revierte: lo contestado sigue en pantalla y se
        // vuelve a mandar al pasar de pregunta.
        if (error) toast.error(error);
      });
    },
    [task.id],
  );

  const hechas = contestadas(pasos, respuestas);

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="size-5" style={{ color: "var(--mod-tasks)" }} aria-hidden />
        <h2 className="text-lg font-medium">La tarea</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
          {hechas} de {pasos.length}
        </span>
      </div>

      <Encuesta
        // Remontar al saltar: la pantalla en la que está la encuesta es suya, y
        // `pasoInicial` sólo se lee al montar.
        key={destino}
        pasoInicial={destino}
        pasos={pasos}
        respuestas={respuestas}
        onCambio={(campo, valor) => setRespuestas((previas) => ({ ...previas, [campo]: valor }))}
        onGuardar={guardar}
        onTerminar={() => toast.success("Tarea guardada.")}
        acento="--mod-tasks"
        guardando={guardando}
        final={
          <Ficha
            pasos={pasos}
            respuestas={respuestas}
            icono={icono}
            onIr={(id) => setDestino(id)}
            onIcono={(valor) => {
              setIcono(valor);
              guardar("icon", valor);
            }}
          />
        }
      />
    </section>
  );
}

/**
 * La ficha de la tarea: todo lo que se sabe, y cada línea es un atajo.
 *
 * Las que no están contestadas también salen, con un guión. Es lo que
 * convierte esta pantalla en el índice de la encuesta en vez de en un resumen
 * de lo hecho: los huecos se ven y se tocan, que es como se acaban rellenando.
 */
function Ficha({
  pasos,
  respuestas,
  icono,
  onIr,
  onIcono,
}: {
  pasos: Paso[];
  respuestas: Respuestas;
  icono: string;
  onIr: (id: string) => void;
  onIcono: (valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold leading-snug">La tarea, entera</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Toca cualquier línea para cambiar sólo eso.
        </p>
      </div>

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
                {ETIQUETAS_TAREA[paso.id] ?? paso.pregunta}
              </dt>
              <dd
                className={
                  texto === null
                    ? "min-w-0 flex-1 text-muted-foreground/60"
                    : "min-w-0 flex-1 whitespace-pre-line text-pretty"
                }
              >
                {texto ?? "--"}
              </dd>
              <Pencil
                className="size-3 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </button>
          );
        })}
      </dl>

      {/* El icono vive aquí y no entre las preguntas, igual que en sueño y en
          comidas: es lo que hace que reconozcas la tarea en la lista sin
          leerla, pero nadie abandona por no tenerlo. */}
      <div
        className="flex flex-col gap-2 border-t border-border pt-3"
        onChangeCapture={(event) => {
          const destino = event.target as HTMLInputElement;
          if (destino.name !== "icon") return;
          if (destino.value === icono) return;
          onIcono(destino.value);
        }}
      >
        <IconPicker name="icon" defaultValue={icono || null} label="Un icono para esta tarea" />
      </div>
    </div>
  );
}

/** Lo que la tarea ya tiene escrito. */
function respuestasIniciales(task: TaskRow): Respuestas {
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    project_id: task.project_id ?? "",
    due_date: task.due_date ?? "",
    // La hora llega de Postgres como «09:00:00» y el campo de hora del
    // navegador sólo entiende «09:00».
    due_time: task.due_time ? task.due_time.slice(0, 5) : "",
    due_end: task.due_end ?? "",
    categories: task.categories,
    notes: task.notes ?? "",
    description: task.description ?? "",
  };
}
