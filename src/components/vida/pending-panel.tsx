import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { PendingItem } from "@/lib/pending/types";
import { cn } from "@/lib/utils";

/**
 * Lo que está esperando a que hagas algo, en un sitio.
 *
 * Estaba repartido entre Actividad, Diario, Conciliación y el Panel: cada uno
 * contestaba su parte y ninguno contestaba «¿qué me falta?», que es la única
 * pregunta que se hace al abrir la aplicación.
 *
 * Cuando no hay nada, se dice y punto. Un panel que siempre ocupa sitio para
 * decir «todo bien» es un panel que se deja de leer.
 */
export function PendingPanel({ items }: { items: PendingItem[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-positive" aria-hidden />
        No hay nada esperando.
      </p>
    );
  }

  return (
    <Card className={items.some((i) => i.severity === "CRITICO") ? "border-negative/40" : undefined}>
      <CardContent className="flex flex-col divide-y divide-border pt-5">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  item.severity === "CRITICO" ? "text-negative" : "text-warning",
                )}
                aria-hidden
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.detail}</span>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 self-center text-xs text-primary group-hover:underline">
              {item.actionLabel}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
