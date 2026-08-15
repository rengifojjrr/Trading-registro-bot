"use client";

import { cn } from "@/lib/utils";
import type { CurrentPriceStatus } from "@/lib/hooks/use-current-price";

/**
 * Says how fresh a "live" number actually is.
 *
 * Without this, a frozen price looked exactly like a moving one -- which is
 * the worst possible failure for a figure the user is about to make a
 * decision on. A number that admits it is two minutes old is far more
 * useful than one that quietly pretends otherwise.
 */
export function LiveStatus({
  status,
  ageMs,
  className,
}: {
  status: CurrentPriceStatus;
  ageMs?: number | null;
  className?: string;
}) {
  if (status === "loading") {
    return <span className={cn("text-xs text-muted-foreground", className)}>Conectando…</span>;
  }

  if (status === "unavailable") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <span className="size-1.5 rounded-full bg-muted-foreground" />
        Precio no disponible
      </span>
    );
  }

  if (status === "stale") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-warning", className)}>
        <span className="size-1.5 rounded-full bg-warning" />
        Sin actualizar {formatAge(ageMs)} — puede no reflejar el precio actual
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="size-1.5 animate-pulse rounded-full bg-positive" />
      En vivo
    </span>
  );
}

function formatAge(ageMs: number | null | undefined): string {
  if (ageMs === null || ageMs === undefined) return "hace un rato";
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 90) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}
