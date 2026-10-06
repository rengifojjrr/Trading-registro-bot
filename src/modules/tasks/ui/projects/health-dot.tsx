import { cn } from "@/lib/utils";
import type { ProjectHealth } from "@/types/database";

import { HEALTH_LABELS } from "@/modules/tasks/domain/projects";

/**
 * El semáforo: un punto **y siempre su texto**. Nunca el color solo, que no
 * lo distingue todo el mundo y no se lee en voz alta.
 */
export function HealthDot({
  level,
  why,
  manual = false,
  showWhy = true,
  wrap = false,
  className,
}: {
  level: ProjectHealth | null;
  why: string;
  manual?: boolean;
  showWhy?: boolean;
  /** El porqué pasa a otra línea en vez de cortarse («…»). */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 gap-1.5 text-sm", wrap ? "items-baseline" : "items-center", className)}>
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          wrap && "self-center",
          level === "VERDE" && "bg-positive",
          level === "AMARILLO" && "bg-warning",
          level === "ROJO" && "bg-negative",
          level === null && "bg-muted-foreground/40",
        )}
      />
      <span
        className={cn(
          "font-medium",
          level === "VERDE" && "text-positive",
          level === "AMARILLO" && "text-warning",
          level === "ROJO" && "text-negative",
          level === null && "text-muted-foreground",
        )}
      >
        {level ? HEALTH_LABELS[level] : why}
      </span>
      {showWhy && level ? (
        <span className={cn("text-muted-foreground", wrap ? "break-words" : "truncate")}>
          · {why}
          {manual ? " (fijado)" : ""}
        </span>
      ) : null}
    </span>
  );
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--mod-tasks)" }} />
      </div>
      <span className="tabular-nums">{label}</span>
    </div>
  );
}
