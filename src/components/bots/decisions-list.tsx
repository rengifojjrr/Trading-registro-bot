import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import type { PendingItem } from "@/lib/pending/types";

/**
 * Lo que el portfolio está esperando que decidas.
 *
 * Cada línea la puso un umbral, no una sensación, y cada una tiene un botón
 * que la resuelve. Si la lista está vacía, lo correcto es no tocar nada.
 */
export function DecisionsList({ items }: { items: PendingItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Nada que decidir. Los semáforos están en verde y la escalera sin activar: no se toca nada, ni para bien
        ni para mal.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={item.severity === "CRITICO" ? "negative" : item.severity === "AVISO" ? "warning" : "outline"}
              >
                {item.severity === "CRITICO" ? "Crítico" : item.severity === "AVISO" ? "Aviso" : "Info"}
              </Badge>
              <span className="text-sm font-medium text-foreground">{item.title}</span>
            </div>
            <p className="text-sm text-muted-foreground">{item.detail}</p>
          </div>
          <Link
            href={item.href as Route}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {item.actionLabel}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
