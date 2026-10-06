"use client";

import { ArrowRightLeft, Check, Circle, CircleDot, Loader2, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayName, shortName } from "@/core/people";
import { PersonAvatar } from "@/core/ui/person-avatar";
import { cn } from "@/lib/utils";
import { PROJECT_LIMITS, compareProjectTasks, dayLabel, originOf, waitingLabel } from "@/modules/tasks/domain/projects";
import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority } from "@/modules/tasks/domain/tasks";
import { addProjectTask, setProjectTaskStatus, updateProjectTask } from "@/modules/tasks/project-actions";
import type { MilestoneRow, PersonRow, ProjectTaskRow, StreamRow } from "@/modules/tasks/project-queries";

import { OriginIcon } from "./origin-icon";

type Agrupar = "PERSONA" | "FRENTE" | "ETAPA" | "ESTADO";

const AGRUPAR_LABELS: Record<Agrupar, string> = {
  PERSONA: "Persona",
  FRENTE: "Frente",
  ETAPA: "Etapa",
  ESTADO: "Estado",
};

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface ProjectTasksProps {
  projectId: string;
  tasks: ProjectTaskRow[];
  /** Quién está en el proyecto, con su papel, para agrupar y asignar. */
  members: { person: PersonRow; role: string | null; waitingDays: number | null }[];
  people: PersonRow[];
  ownerId: string | null;
  streams: StreamRow[];
  milestones: MilestoneRow[];
  today: string;
  /** Abre el formulario con esta persona ya puesta («+ tarea para Lucía»). */
  prefillAssignee?: string | null;
  /** Las tareas nuevas nacen colgadas de este hito (en la página del hito). */
  defaultMilestoneId?: string;
}

/**
 * Las tareas del proyecto, por persona.
 *
 * Por persona de entrada porque es la pregunta de un proyecto con gente: qué
 * le toca a cada uno. Se puede agrupar también por frente, etapa o estado.
 * Quien está en el proyecto sin tareas sale igual, con «+ tarea para…»: que no
 * tenga nada también es información.
 */
export function ProjectTasks(props: ProjectTasksProps) {
  const { tasks, members, ownerId, streams, milestones } = props;
  const [agrupar, setAgrupar] = useState<Agrupar>("PERSONA");
  const [verHechas, setVerHechas] = useState(false);
  const [para, setPara] = useState<string | null>(props.prefillAssignee ?? null);

  const personas = new Map(props.people.map((p) => [p.id, p]));
  /** Quién la hace, para la tarjeta cuando no se agrupa por persona. */
  const quienHace = (id: string | null): { person: PersonRow | null; nombre: string } =>
    id === null
      ? { person: null, nombre: "Sin asignar" }
      : { person: personas.get(id) ?? null, nombre: personas.get(id) ? displayName(personas.get(id)!) : "Alguien" };
  const hitos = milestones.filter((m) => m.kind === "HITO");
  const etapaDe = new Map(milestones.map((m) => [m.id, m.kind === "ETAPA" ? m.id : m.stage_id]));
  const tituloDe = new Map(milestones.map((m) => [m.id, m.title]));

  const madres = tasks.filter((t) => t.parent_id === null || !tasks.some((x) => x.id === t.parent_id));
  const hijas = (id: string) => tasks.filter((t) => t.parent_id === id);
  // Dentro de cada grupo: lo vencido primero, luego por fecha y prioridad. En
  // el orden en que se crearon, con cuarenta tareas lo atrasado quedaba en
  // medio de la lista.
  const abiertas = madres.filter((t) => t.status !== "HECHA").sort((a, b) => compareProjectTasks(a, b, props.today));
  const hechas = madres.filter((t) => t.status === "HECHA");
  // «Etapa» sólo tiene sentido si alguna tarea cuelga de un hito; si no, todo
  // caía en «Sin etapa».
  const hayEtapas = abiertas.some((t) => t.milestone_id !== null);
  const opcionesAgrupar = (Object.keys(AGRUPAR_LABELS) as Agrupar[]).filter((a) => a !== "ETAPA" || hayEtapas);
  const agruparVisto: Agrupar = opcionesAgrupar.includes(agrupar) ? agrupar : "PERSONA";

  // Sin useMemo: el compilador de React ya memoriza lo que hace falta.
  const grupos = (() => {
    const out: { key: string; titulo: string; sub?: string; persona?: PersonRow; items: ProjectTaskRow[] }[] = [];
    const push = (key: string, titulo: string, task: ProjectTaskRow | null, extra: Partial<(typeof out)[number]> = {}) => {
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, titulo, items: [], ...extra };
        out.push(g);
      }
      if (task) g.items.push(task);
    };

    if (agruparVisto === "PERSONA") {
      if (ownerId) push(ownerId, "Tú", null, { persona: personas.get(ownerId) });
      for (const m of members.filter((m) => m.person.id !== ownerId)) {
        push(m.person.id, m.person.name, null, {
          persona: m.person,
          sub: [m.role, m.waitingDays !== null ? waitingLabel(m.waitingDays) : null].filter(Boolean).join(" · "),
        });
      }
      for (const t of abiertas) {
        if (t.assignee_id === null) push("~nadie", "Sin asignar", t);
        else {
          const p = personas.get(t.assignee_id);
          push(t.assignee_id, p ? displayName(p) : "Alguien", t, { persona: p });
        }
      }
    } else if (agruparVisto === "FRENTE") {
      for (const s of streams) push(s.id, s.name, null);
      for (const t of abiertas) {
        const s = streams.find((x) => x.id === t.stream_id);
        push(s?.id ?? "~sin", s?.name ?? "Sin frente", t);
      }
    } else if (agruparVisto === "ETAPA") {
      for (const t of abiertas) {
        const etapa = t.milestone_id ? etapaDe.get(t.milestone_id) : null;
        push(etapa ?? "~sin", etapa ? (tituloDe.get(etapa) ?? "Etapa") : "Sin etapa", t);
      }
    } else {
      for (const t of abiertas) push(t.status, STATUS_LABELS[t.status], t);
    }
    // Las vacías sólo cuentan cuando son personas (que no tengan nada es dato).
    return out
      .filter((g) => g.items.length > 0 || agruparVisto === "PERSONA")
      .sort((a, b) => Number(a.key.startsWith("~")) - Number(b.key.startsWith("~")));
  })();

  const opcionesPersona = [
    { value: "YO", label: "Tú" },
    ...members.filter((m) => m.person.id !== ownerId).map((m) => ({ value: m.person.id, label: m.person.name })),
    { value: "NADIE", label: "Sin asignar" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <NuevaTarea
        projectId={props.projectId}
        personas={opcionesPersona}
        streams={streams}
        hitos={hitos}
        para={para}
        onDone={() => setPara(null)}
        hitoInicial={props.defaultMilestoneId}
      />

      <div role="group" aria-label="Agrupar" className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1">
        <span className="shrink-0 text-xs text-muted-foreground">Agrupar:</span>
        {opcionesAgrupar.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={agruparVisto === a}
            onClick={() => setAgrupar(a)}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-3 text-sm",
              agruparVisto === a ? "border-primary bg-accent font-medium text-primary" : "border-border text-muted-foreground",
            )}
          >
            {AGRUPAR_LABELS[a]}
          </button>
        ))}
      </div>

      {abiertas.length === 0 && grupos.every((g) => g.items.length === 0) && agruparVisto !== "PERSONA" ? (
        <p className="text-sm text-muted-foreground">Nada pendiente en este proyecto.</p>
      ) : null}

      {grupos.map((g) => (
        <section key={g.key} className="flex flex-col gap-1.5">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {g.persona ? <PersonAvatar person={g.persona} size="sm" /> : null}
            <span className="min-w-0 break-words">{g.titulo}</span>
            {g.sub ? <span className="text-xs font-normal text-muted-foreground">· {g.sub}</span> : null}
            <span className="text-xs font-normal text-muted-foreground">· {g.items.length}</span>
          </h3>
          {g.items.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              subtasks={hijas(t.id)}
              props={props}
              opcionesPersona={opcionesPersona}
              quien={agruparVisto === "PERSONA" ? null : quienHace(t.assignee_id)}
            />
          ))}
          {g.items.length === 0 && g.persona ? (
            <button
              type="button"
              onClick={() => setPara(g.key === ownerId ? "YO" : g.key)}
              className="flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">tarea para {g.titulo === "Tú" ? "ti" : shortName(g.titulo)}</span>
            </button>
          ) : null}
        </section>
      ))}

      {hechas.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setVerHechas((v) => !v)}
            aria-expanded={verHechas}
            className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <span aria-hidden>{verHechas ? "▾" : "▸"}</span> Hechas ({hechas.length})
          </button>
          {verHechas
            ? hechas.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  subtasks={hijas(t.id)}
                  props={props}
                  opcionesPersona={opcionesPersona}
                  quien={quienHace(t.assignee_id)}
                />
              ))
            : null}
        </section>
      ) : null}
    </div>
  );
}

function NuevaTarea({
  projectId,
  personas,
  streams,
  hitos,
  para,
  onDone,
  parentId,
  hitoInicial,
}: {
  projectId: string;
  personas: { value: string; label: string }[];
  streams: StreamRow[];
  hitos: MilestoneRow[];
  para: string | null;
  onDone?: () => void;
  parentId?: string;
  hitoInicial?: string;
}) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(para ?? "YO");
  const [due, setDue] = useState("");
  const [stream, setStream] = useState("");
  const [hito, setHito] = useState(hitoInicial ?? "");
  const [priority, setPriority] = useState<TaskPriority>("MEDIA");
  const [mas, setMas] = useState(false);
  const [paraVisto, setParaVisto] = useState(para);

  // «+ tarea para Lucía» cambia la persona del formulario sin recrearlo.
  if (para !== paraVisto) {
    setParaVisto(para);
    if (para) setAssignee(para);
  }

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addProjectTask(projectId, {
        title,
        assignee: assignee as "YO",
        due_date: due,
        stream_id: stream,
        milestone_id: hito,
        priority,
        parent_id: parentId ?? "",
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Tarea añadida.");
      setTitle("");
      setDue("");
      onDone?.();
    });
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={parentId ? "Subtarea" : "¿Qué hay que hacer?"}
          aria-label={parentId ? "Subtarea" : "Nueva tarea"}
          maxLength={PROJECT_LIMITS.taskTitle}
          required
          className="h-11"
        />
        <Button type="submit" disabled={pending} className="h-11" aria-label="Añadir">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          <span className="hidden sm:inline">Añadir</span>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Quién la hace" className={selectClass}>
          {personas.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha" className="h-11" />
      </div>
      {!parentId ? (
        <button
          type="button"
          onClick={() => setMas((m) => !m)}
          aria-expanded={mas}
          className="flex min-h-11 w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden /> Frente, hito y prioridad
        </button>
      ) : null}
      {mas ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Frente" className={selectClass}>
            <option value="">Sin frente</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={hito} onChange={(e) => setHito(e.target.value)} aria-label="Hito" className={selectClass}>
            <option value="">Sin hito</option>
            {hitos.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} aria-label="Prioridad" className={selectClass}>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                Prioridad {l.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </form>
  );
}

function TaskRow({
  task,
  subtasks,
  props,
  opcionesPersona,
  esSubtarea = false,
  quien = null,
}: {
  task: ProjectTaskRow;
  subtasks: ProjectTaskRow[];
  props: ProjectTasksProps;
  opcionesPersona: { value: string; label: string }[];
  esSubtarea?: boolean;
  /** Quién la hace, cuando la lista no va agrupada por persona. */
  quien?: { person: PersonRow | null; nombre: string } | null;
}) {
  const [pending, start] = useTransition();
  const [abierta, setAbierta] = useState(false);
  const hecha = task.status === "HECHA";
  const atrasada = !hecha && task.due_date !== null && task.due_date < props.today;
  const origen = originOf(task, props.today);

  const alternar = () =>
    start(async () => {
      const r = await setProjectTaskStatus(task.id, hecha ? "NO_INICIADA" : "HECHA");
      if (r.error) toast.error(r.error);
    });

  const mover = (patch: Parameters<typeof updateProjectTask>[1]) =>
    start(async () => {
      const r = await updateProjectTask(task.id, patch);
      if (r.error) toast.error(r.error);
      else toast.success("Movida.");
    });

  const asignadoA = task.assignee_id === null ? "NADIE" : task.assignee_id === props.ownerId ? "YO" : task.assignee_id;

  return (
    <div className={cn("flex flex-col", esSubtarea && "ml-7")}>
      <div className="flex items-start gap-2 rounded-lg border border-border px-2 py-1.5">
        <button
          type="button"
          onClick={alternar}
          disabled={pending}
          aria-pressed={hecha}
          aria-label={hecha ? `Desmarcar ${task.title}` : `Marcar ${task.title} como hecha`}
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : hecha ? (
            <Check className="size-5" style={{ color: "var(--mod-tasks)" }} aria-hidden />
          ) : task.status === "EN_CURSO" ? (
            <CircleDot className="size-5" style={{ color: "var(--mod-tasks)" }} aria-hidden />
          ) : (
            <Circle className="size-5" aria-hidden />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col py-1.5">
          <Link
            href={`/tareas/${task.id}` as Route}
            className={cn("text-sm hover:underline", hecha && "text-muted-foreground line-through")}
          >
            {task.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {quien ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-foreground">
                {quien.person ? <PersonAvatar person={quien.person} size="sm" /> : null}
                <span className="max-w-[9rem] truncate">{quien.nombre}</span>
              </span>
            ) : null}
            {task.due_date ? (
              <span className={cn("tabular-nums", atrasada && "text-negative")}>{dayLabel(task.due_date, props.today)}</span>
            ) : null}
            {task.priority !== "MEDIA" ? <span>prioridad {PRIORITY_LABELS[task.priority].toLowerCase()}</span> : null}
            {subtasks.length > 0 ? (
              <span>
                {subtasks.filter((s) => s.status === "HECHA").length}/{subtasks.length} subtareas
              </span>
            ) : null}
          </div>
        </div>
        <OriginIcon origin={origen.key} text={origen.text} />
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-label={`Mover ${task.title}: quién, fecha, frente o hito`}
          title="Mover"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <ArrowRightLeft className="size-4" aria-hidden />
        </button>
      </div>

      {abierta ? (
        <div className="mt-1 grid grid-cols-2 gap-2 rounded-lg bg-secondary/40 p-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Quién
            <select defaultValue={asignadoA} onChange={(e) => mover({ assignee: e.target.value as "YO" })} className={selectClass}>
              {opcionesPersona.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              {task.assignee_id && !opcionesPersona.some((p) => p.value === task.assignee_id) && asignadoA !== "YO" ? (
                <option value={task.assignee_id}>{props.people.find((p) => p.id === task.assignee_id)?.name ?? "Otra persona"}</option>
              ) : null}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Fecha
            <Input type="date" defaultValue={task.due_date ?? ""} onChange={(e) => mover({ due_date: e.target.value })} className="h-11" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Frente
            <select defaultValue={task.stream_id ?? ""} onChange={(e) => mover({ stream_id: e.target.value })} className={selectClass}>
              <option value="">Sin frente</option>
              {props.streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Hito
            <select defaultValue={task.milestone_id ?? ""} onChange={(e) => mover({ milestone_id: e.target.value })} className={selectClass}>
              <option value="">Sin hito</option>
              {props.milestones
                .filter((m) => m.kind === "HITO")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
            </select>
          </label>
          {!esSubtarea ? (
            <div className="col-span-2">
              <NuevaTarea
                projectId={props.projectId}
                personas={opcionesPersona}
                streams={props.streams}
                hitos={props.milestones.filter((m) => m.kind === "HITO")}
                para={asignadoA}
                parentId={task.id}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {subtasks.map((s) => (
        <div key={s.id} className="mt-1">
          <TaskRow task={s} subtasks={[]} props={props} opcionesPersona={opcionesPersona} esSubtarea />
        </div>
      ))}
    </div>
  );
}
