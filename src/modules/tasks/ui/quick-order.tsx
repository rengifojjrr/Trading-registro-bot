"use client";

import { Loader2, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveReminderAction } from "@/core/reminders/actions";
import { ReminderSheet } from "@/core/reminders/ui/reminder-sheet";
import { addLogEntry, addMilestone, addProjectTask, setProjectHealth, updateProjectFields } from "@/modules/tasks/project-actions";
import { parseOrder, type ContextoOrden, type Orden, type ResultadoOrden } from "@/modules/tasks/domain/order-parse";

/**
 * La orden rápida: un renglón que entiende frases fijas, sin IA.
 *
 * «en petróleo agrega llamar al abogado el jueves», «recuérdame cada día a las
 * 8 revisar el precio», «nota en petróleo: …», «petróleo está atascado». Se
 * dicta con el micrófono del teclado (la web no graba audio: tendría voces de
 * otros). Antes de guardar enseña «Así lo entendí» y espera el toque.
 */
export function QuickOrder({
  ctx,
  placeholder = "en petróleo agrega llamar al abogado el jueves",
}: {
  ctx: Omit<ContextoOrden, "now">;
  placeholder?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoOrden | null>(null);
  const [descartados, setDescartados] = useState<string[]>([]);
  const [hoja, setHoja] = useState(false);

  const leer = (t: string, fuera: string[] = descartados) => {
    if (t.trim() === "") {
      setResultado(null);
      return;
    }
    setResultado(
      parseOrder(t, {
        ...ctx,
        now: new Date(),
        projects: ctx.projects.filter((p) => !fuera.includes(p.id)),
      }),
    );
  };

  const elegir = (id: string) => {
    // «¿Cuál?»: los demás candidatos se dejan fuera y se vuelve a leer.
    const otros = resultado && !resultado.ok ? (resultado.candidatos ?? []).map((c) => c.id).filter((x) => x !== id) : [];
    const fuera = [...descartados, ...otros];
    setDescartados(fuera);
    leer(texto, fuera);
  };

  const limpiar = () => {
    setTexto("");
    setResultado(null);
    setDescartados([]);
  };

  const guardar = (orden: Orden) =>
    start(async () => {
      const error = await aplicar(orden);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(orden.tipo === "RECORDATORIO" ? "Listo. Te suena en el teléfono." : "Listo.");
      limpiar();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (resultado?.ok) guardar(resultado.orden);
          else leer(texto);
        }}
        className="relative"
      >
        <Input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setDescartados([]);
            leer(e.target.value, []);
          }}
          placeholder={placeholder}
          aria-label="Orden rápida"
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 pr-11 text-base"
        />
        <Mic
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </form>

      {resultado ? (
        resultado.ok ? (
          <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-card p-3 text-sm" aria-live="polite">
            <p className="min-w-0 flex-1 break-words">
              <span className="text-muted-foreground">Así lo entendí: </span>
              {resultado.entendido}
            </p>
            <div className="flex gap-2">
              <Button type="button" className="min-h-11" disabled={pending} onClick={() => guardar(resultado.orden)}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Guardar
              </Button>
              {resultado.orden.tipo === "RECORDATORIO" ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setHoja(true)}>
                  Cambiar
                </Button>
              ) : null}
              <Button type="button" variant="ghost" className="min-h-11" onClick={limpiar}>
                Borrar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <span>{resultado.motivo}</span>
            {(resultado.candidatos ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => elegir(c.id)}
                className="min-h-11 rounded-full border border-border px-3 text-foreground hover:border-foreground/30"
              >
                {c.name}
              </button>
            ))}
          </div>
        )
      ) : null}

      {resultado?.ok && resultado.orden.tipo === "RECORDATORIO" ? (
        <ReminderSheet
          open={hoja}
          onOpenChange={(abierta) => {
            setHoja(abierta);
            if (!abierta) router.refresh();
          }}
          tz={ctx.tz}
          targets={{ projects: ctx.projects.map((p) => ({ id: p.id, name: p.name })), people: [] }}
          defaultProjectId={resultado.orden.projectId}
          initialPhrase={texto}
          onSaved={limpiar}
        />
      ) : null}
    </div>
  );
}

/** Guarda lo entendido con las mismas acciones que los formularios. Devuelve el error, si lo hay. */
async function aplicar(orden: Orden): Promise<string | null> {
  switch (orden.tipo) {
    case "TAREA": {
      const r = await addProjectTask(orden.projectId, {
        title: orden.title,
        assignee: orden.personId ?? "YO",
        due_date: orden.due ?? "",
      });
      return r.error;
    }
    case "NOTA": {
      const r = await addLogEntry(orden.projectId, { kind: orden.logKind, text: orden.text });
      return r.error;
    }
    case "ESTADO": {
      const r = orden.status
        ? await updateProjectFields(orden.projectId, { status: orden.status })
        : await setProjectHealth(orden.projectId, orden.health);
      if (r.error) return r.error;
      if (orden.why) {
        const nota = await addLogEntry(orden.projectId, {
          kind: orden.status === "ATASCADO" ? "BLOQUEO" : "NOTA",
          text: orden.why,
        });
        return nota.error;
      }
      return null;
    }
    case "HITO": {
      const r = await addMilestone(orden.projectId, {
        kind: "HITO",
        title: orden.title,
        due_on: orden.due ?? "",
        due_precision: orden.precision,
      });
      return r.error;
    }
    case "RECORDATORIO": {
      const v = orden.reminder;
      const r = await saveReminderAction({
        kind: v.kind,
        text: v.kind === "TEXTO" ? v.text : "",
        freq: v.rule.freq,
        atTime: v.rule.atTime,
        days: v.rule.days,
        monthday: v.rule.monthday,
        everyN: v.rule.everyN,
        onDate: v.rule.onDate,
        untilDate: v.rule.untilDate,
        entityKind: orden.projectId ? "PROYECTO" : null,
        entityId: orden.projectId,
        timeSaid: v.timeSaid,
      });
      return r.ok ? null : (r.error ?? "No se pudo guardar.");
    }
  }
}
