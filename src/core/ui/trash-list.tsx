"use client";

import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { purgeOneAction, restoreAction } from "@/core/actions";

/**
 * Lo que hay en la papelera.
 *
 * Dos acciones y ninguna más: devolverlo o tirarlo del todo. Tirarlo del todo
 * sí es irreversible, así que es el botón discreto y el otro el que se ve.
 */
export interface TrashItem {
  id: string;
  label: string;
  kindLabel: string;
  colorToken: string;
  when: string;
  /** Cuánto le queda antes de borrarse del todo. */
  retentionLabel: string;
  expiring: boolean;
}

export function TrashList({ items }: { items: TrashItem[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <span
            className="shrink-0 text-xs font-medium uppercase tracking-wide"
            style={{ color: `var(${item.colorToken})` }}
          >
            {item.kindLabel}
          </span>

          <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>

          <span className="text-xs text-muted-foreground">{item.when}</span>

          <span
            className={`text-xs ${item.expiring ? "font-medium text-warning" : "text-muted-foreground"}`}
          >
            {item.retentionLabel}
          </span>

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const ok = await restoreAction(item.id, "/papelera");
                if (ok) toast.success("Recuperado.");
                else toast.error("No se pudo recuperar.");
              })
            }
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )}
            Restaurar
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await purgeOneAction(item.id, "/papelera");
                toast.success("Borrado del todo.");
              })
            }
            aria-label={`Borrar ${item.label} definitivamente`}
            title="Borrar definitivamente"
            className="shrink-0 text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
