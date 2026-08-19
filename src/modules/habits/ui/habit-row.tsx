"use client";

import { Archive, ArchiveRestore, Check, Flame, Loader2 } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import type { Route } from "next";

import { cn } from "@/lib/utils";
import { archiveHabit, toggleHabit } from "@/modules/habits/actions";

/**
 * Un hábito, con su casilla del día y su racha.
 *
 * La marca es optimista: pulsar y esperar a que vuelva el servidor hace que
 * marcar diez hábitos por la mañana se sienta lento, que es exactamente la
 * fricción que hace abandonar un seguimiento de hábitos.
 */
export function HabitRow({
  id,
  name,
  emoji,
  date,
  doneToday,
  streak,
  rate,
  archived,
}: {
  id: string;
  name: string;
  emoji: string | null;
  date: string;
  doneToday: boolean;
  streak: number;
  rate: number;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useOptimistic(doneToday);

  function toggle() {
    startTransition(async () => {
      setDone(!done);
      try {
        await toggleHabit(id, date, !done);
      } catch {
        toast.error("No se pudo guardar la marca.");
      }
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border px-3 py-2.5",
        archived && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={pending || archived}
        aria-pressed={done}
        aria-label={done ? `Desmarcar ${name}` : `Marcar ${name}`}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
          done
            ? "border-transparent text-background"
            : "border-border text-muted-foreground hover:border-foreground/40",
        )}
        style={done ? { backgroundColor: "var(--mod-habits)" } : undefined}
      >
        {done ? <Check className="size-4" aria-hidden /> : <span className="text-base">{emoji ?? "·"}</span>}
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/habitos/${id}` as Route} className="truncate text-sm font-medium hover:underline">
          {emoji && done ? `${emoji} ` : ""}
          {name}
        </Link>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {streak > 0 ? (
            <span className="flex items-center gap-1">
              <Flame className="size-3" aria-hidden />
              {streak} {streak === 1 ? "día" : "días"}
            </span>
          ) : (
            <span>Sin racha</span>
          )}
          <span aria-hidden>·</span>
          <span className="tabular-nums">{rate}% este trimestre</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await archiveHabit(id, !archived);
            toast.success(archived ? "Hábito retomado." : "Hábito archivado.");
          })
        }
        disabled={pending}
        aria-label={archived ? `Retomar ${name}` : `Archivar ${name}`}
        title={archived ? "Retomar" : "Archivar (conserva el histórico)"}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : archived ? (
          <ArchiveRestore className="size-4" aria-hidden />
        ) : (
          <Archive className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
