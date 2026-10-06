"use client";

import { ExternalLink, Laptop, Loader2, Pencil, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/core/ui/markdown-view";
import { cn } from "@/lib/utils";
import {
  LOG_KINDS_BY_HAND,
  LOG_KIND_LABELS,
  PROJECT_LIMITS,
  dateIn,
  dayLabel,
} from "@/modules/tasks/domain/projects";
import {
  addLogEntry,
  addSource,
  removeSource,
  restoreFichaVersion,
  saveFicha,
  saveHow,
} from "@/modules/tasks/project-actions";
import type { DocRow, DocVersionRow, LogRow, SourceRow } from "@/modules/tasks/project-queries";
import type { AuthorKind, LogKind } from "@/types/database";

const QUIEN: Record<AuthorKind, string> = { OWNER: "tú", CLAUDE: "Claude", BOT: "el bot" };

/** «lo escribiste tú», «lo escribió Claude»: el verbo concuerda con quien. */
function escrito(by: AuthorKind, pronombre: "lo" | "la"): string {
  return by === "OWNER" ? `${pronombre} escribiste tú` : `${pronombre} escribió ${QUIEN[by]}`;
}

// ------------------------------------------------------------------ cómo va

/** «Cómo va»: tu frase, con cuándo y quién la escribió. Se edita aquí mismo. */
export function HowCard({
  projectId,
  how,
  howAt,
  howBy,
  today,
  timezone,
}: {
  projectId: string;
  how: string | null;
  howAt: string | null;
  howBy: AuthorKind | null;
  today: string;
  timezone: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(how ?? "");
  const [pending, start] = useTransition();
  // Lo guardado se enseña en el acto, como tuyo: esperar a la recarga dejaba
  // unos segundos el texto viejo con «lo escribió Claude» después de «Guardado».
  const [guardado, setGuardado] = useState<{ how: string | null; at: string } | null>(null);
  const [visto, setVisto] = useState(how);
  if (how !== visto) {
    // Llegó lo de la base (la recarga, u otro cambio): manda eso.
    setVisto(how);
    setGuardado(null);
    if (!editando) setTexto(how ?? "");
  }

  const mostrado = guardado
    ? { how: guardado.how, at: guardado.at, by: "OWNER" as AuthorKind }
    : { how, at: howAt, by: howBy };

  const guardar = () =>
    start(async () => {
      const r = await saveHow(projectId, texto);
      if (r.error) toast.error(r.error);
      else {
        setGuardado({ how: texto.trim() === "" ? null : texto.trim(), at: new Date().toISOString() });
        toast.success("Guardado.");
        setEditando(false);
      }
    });

  const cancelar = () => {
    // Cancelar descarta lo escrito: la próxima vez se empieza por lo que hay.
    setTexto(mostrado.how ?? "");
    setEditando(false);
  };

  return (
    <section aria-label="Cómo va" className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Cómo va</h2>
        {mostrado.at ? (
          <span className="text-xs text-muted-foreground">
            {dayLabel(dateIn(mostrado.at, timezone), today)}
            {mostrado.by ? ` · ${escrito(mostrado.by, "lo")}` : ""}
          </span>
        ) : null}
      </div>
      {editando ? (
        <>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={PROJECT_LIMITS.how}
            rows={3}
            aria-label="Cómo va"
            placeholder="En una o dos frases: dónde está y qué falta."
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" onClick={guardar} disabled={pending} className="min-h-11">
              Guardar
            </Button>
            <Button type="button" variant="ghost" onClick={cancelar} className="min-h-11">
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm", !mostrado.how && "text-muted-foreground")}>
            {mostrado.how ?? "Aún no has dicho cómo va."}
          </p>
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => setEditando(true)} aria-label="Editar cómo va">
            <Pencil aria-hidden />
          </Button>
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------------------------- ficha

/**
 * La ficha técnica: el documento del proyecto por secciones.
 *
 * Se lee con formato y se edita como texto. Cada vez que cambia, la base
 * guarda la versión anterior; «Volver a esta» la recupera sin perder la de
 * ahora.
 */
export function FichaPanel({
  projectId,
  ficha,
  versions,
  today,
  timezone,
}: {
  projectId: string;
  ficha: DocRow | null;
  versions: DocVersionRow[];
  today: string;
  timezone: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(ficha?.body_md ?? PLANTILLA_FICHA);
  const [pending, start] = useTransition();

  const guardar = () =>
    start(async () => {
      const r = await saveFicha(projectId, texto);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Ficha guardada.");
        setEditando(false);
      }
    });

  const volver = (version: number) =>
    start(async () => {
      const r = await restoreFichaVersion(projectId, version);
      if (r.error) toast.error(r.error);
      else toast.success(`Recuperada la versión ${version}. La de antes queda guardada.`);
    });

  return (
    <div className="flex flex-col gap-3">
      {editando ? (
        <>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={18}
            maxLength={PROJECT_LIMITS.docBody}
            aria-label="Ficha técnica"
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="button" onClick={guardar} disabled={pending} className="min-h-11">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Guardar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)} className="min-h-11">
              Cancelar
            </Button>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Vista previa</summary>
            <MarkdownView source={texto} className="mt-2" />
          </details>
        </>
      ) : ficha ? (
        <>
          <MarkdownView source={ficha.body_md} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Versión {ficha.version} · {escrito(ficha.made_by, "la")} · {dayLabel(dateIn(ficha.updated_at, timezone), today)}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Pencil aria-hidden /> Editar
            </Button>
          </div>
          {versions.length > 0 ? (
            <details>
              <summary className="min-h-11 cursor-pointer text-sm text-muted-foreground">Versiones anteriores ({versions.length})</summary>
              <ul className="mt-1 flex flex-col divide-y divide-border">
                {versions.map((v) => (
                  <li key={v.version} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span>
                      Versión {v.version} · {QUIEN[v.made_by]} · {dayLabel(dateIn(v.created_at, timezone), today)}
                    </span>
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => volver(v.version)}>
                      Volver a esta
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            Sin ficha todavía: qué es, dónde, quién es quién, los datos, los riesgos y las decisiones.
          </p>
          <Button type="button" variant="outline" onClick={() => setEditando(true)} className="min-h-11">
            <Plus aria-hidden /> Escribir la ficha
          </Button>
        </div>
      )}
    </div>
  );
}

const PLANTILLA_FICHA = `### Qué es

### Dónde

### Datos
| Dato | Valor |
|---|---|
|  |  |

### Riesgos

### Decisiones tomadas

### Preguntas abiertas
`;

// ------------------------------------------------------------------ bitácora

const COLOR_TIPO: Partial<Record<LogKind, string>> = {
  AVANCE: "text-positive",
  DECISION: "text-[color:var(--mod-content)]",
  BLOQUEO: "text-negative",
  LLAMADA: "text-[color:var(--mod-trading)]",
  REUNION: "text-[color:var(--mod-trading)]",
};

/**
 * La bitácora: lo que pasó, lo más nuevo arriba, con un separador por día.
 *
 * Lo que apunta la aplicación sola (un cambio de estado) sale en gris pequeño
 * y se puede esconder.
 */
export function LogPanel({
  projectId,
  log,
  today,
  timezone,
}: {
  projectId: string;
  log: LogRow[];
  today: string;
  timezone: string;
}) {
  const [kind, setKind] = useState<LogKind>("NOTA");
  const [texto, setTexto] = useState("");
  const [verAuto, setVerAuto] = useState(true);
  const [pending, start] = useTransition();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addLogEntry(projectId, { kind, text: texto });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Apuntado.");
        setTexto("");
      }
    });
  };

  const visibles = log.filter((l) => verAuto || !l.auto);
  const porDia: { dia: string; items: LogRow[] }[] = [];
  for (const l of visibles) {
    const dia = dateIn(l.at, timezone);
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.items.push(l);
    else porDia.push({ dia, items: [l] });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={guardar} className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
        <div role="group" aria-label="Tipo" className="flex flex-wrap gap-1.5">
          {LOG_KINDS_BY_HAND.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-sm",
                kind === k ? "border-primary bg-accent font-medium text-primary" : "border-border text-muted-foreground",
              )}
            >
              {LOG_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="¿Qué pasó?"
            aria-label="¿Qué pasó?"
            maxLength={PROJECT_LIMITS.logBody}
            required
            className="h-11"
          />
          <Button type="submit" disabled={pending} className="h-11">
            Apuntar
          </Button>
        </div>
      </form>

      {log.some((l) => l.auto) ? (
        <label className="flex min-h-11 w-fit items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={verAuto} onChange={(e) => setVerAuto(e.target.checked)} className="size-4" />
          Ver lo que apunta la app sola
        </label>
      ) : null}

      {porDia.length === 0 ? <p className="text-sm text-muted-foreground">Nada apuntado todavía.</p> : null}

      {porDia.map(({ dia, items }) => (
        <section key={dia} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dayLabel(dia, today)}</h3>
          <ul className="flex flex-col gap-1.5">
            {items.map((l) => (
              <li key={l.id} className={cn("text-sm", l.auto && "text-xs text-muted-foreground")}>
                {!l.auto ? (
                  <span className={cn("mr-1.5 text-xs font-medium uppercase", COLOR_TIPO[l.kind] ?? "text-muted-foreground")}>
                    {LOG_KIND_LABELS[l.kind]}
                  </span>
                ) : null}
                {l.body ?? l.title}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------- fuentes

/**
 * De dónde se alimenta el proyecto. Hoy, documentos y enlaces; las llamadas,
 * las reuniones y los chats llegarán cuando el bot esté conectado, y de ellos
 * sólo subirá el hecho (qué, cuándo, cuánto), nunca lo que se dijo.
 */
export function SourcesPanel({ projectId, sources }: { projectId: string; sources: SourceRow[] }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addSource(projectId, { label, url });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Guardado.");
        setLabel("");
        setUrl("");
      }
    });
  };

  // Quitar es de un toque y en el borde donde cae el pulgar: se puede
  // deshacer durante unos segundos, como en el resto de la app.
  const quitar = (s: SourceRow) =>
    start(async () => {
      const r = await removeSource(s.id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Quitado.", {
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void addSource(projectId, { label: s.label, url: s.kind === "ENLACE" ? s.ref : null }).then((v) => {
              if (v.error) toast.error(v.error);
            });
          },
        },
      });
    });

  return (
    <div className="flex flex-col gap-4">
      {sources.length === 0 ? <p className="text-sm text-muted-foreground">Sin documentos ni enlaces.</p> : null}
      <ul className="flex flex-col divide-y divide-border">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
            {s.kind === "ENLACE" && s.ref && /^https?:\/\//i.test(s.ref) ? (
              <a href={s.ref} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 hover:underline">
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{s.label}</span>
              </a>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <Laptop className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">en tu Mac</span>
              </span>
            )}
            <Button type="button" variant="ghost" size="icon" className="size-11" disabled={pending} onClick={() => quitar(s)} aria-label={`Quitar ${s.label}`}>
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={guardar} className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre (Contrato borrador…)" aria-label="Nombre" maxLength={PROJECT_LIMITS.sourceLabel} required className="h-11" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (vacío si está en tu Mac)" aria-label="Dirección" type="url" maxLength={PROJECT_LIMITS.sourceRef} className="h-11" />
        <Button type="submit" disabled={pending} className="min-h-11 w-fit">
          <Plus aria-hidden /> Añadir
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Las llamadas, las reuniones y los chats aparecerán aquí cuando el bot esté conectado a la app.
      </p>
    </div>
  );
}
