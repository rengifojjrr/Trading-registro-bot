"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { restoreAction, trashAction } from "@/core/actions";
import { cn } from "@/lib/utils";
import type { EntityKind } from "@/types/database";

/**
 * Borrar con vuelta atrás.
 *
 * Antes el botón borraba en el acto y sin preguntar, y estaba justo al lado
 * del que cambia el estado: un dedo torcido en el móvil era una pérdida real.
 *
 * No se pregunta «¿seguro?» a propósito. Un diálogo de confirmación aparece
 * cada vez, incluidas las novecientas veces que sí querías borrar, y acaba
 * aceptándose sin leer -- con lo cual deja de proteger de nada. Deshacer sólo
 * molesta cuando hace falta, y es el gesto que usa Notion.
 *
 * `redirectTo` es para las fichas: al borrar desde dentro hay que salir, o la
 * página se queda mirando una fila que ya no existe.
 */
export function DeleteButton({
  kind,
  entityId,
  path,
  label,
  redirectTo,
  onRemoved,
  variant = "icon",
  className,
}: {
  kind: EntityKind;
  entityId: string;
  /** Qué ruta refrescar tras borrar. */
  path: string;
  /** Cómo se llama lo que se borra, para el aviso. */
  label: string;
  redirectTo?: string;
  /**
   * Lo que el módulo tenga que rehacer después.
   *
   * La papelera es común y no sabe nada de las cuentas de cada módulo: al
   * borrar una tarea hay que rehacer las de la pantalla de inicio, y al
   * restaurarla también. Se llama en los dos casos por eso mismo.
   */
  onRemoved?: () => Promise<void>;
  variant?: "icon" | "text";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove() {
    startTransition(async () => {
      const { trashId } = await trashAction(kind, entityId, path);

      if (trashId === null) {
        toast.error("No se pudo borrar.");
        return;
      }

      await onRemoved?.();

      toast.success(`${label} en la papelera.`, {
        description: "Se guarda 30 días.",
        action: {
          label: "Deshacer",
          onClick: () => {
            startTransition(async () => {
              const ok = await restoreAction(trashId, path);
              if (ok) {
                await onRemoved?.();
                toast.success("Recuperado.");
                router.refresh();
              } else {
                toast.error("No se pudo recuperar.");
              }
            });
          },
        },
      });

      if (redirectTo) router.push(redirectTo);
    });
  }

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className={cn(
          "flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-negative disabled:opacity-50",
          className,
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
        Borrar
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      aria-label={`Borrar ${label}`}
      className={cn(
        "shrink-0 text-muted-foreground transition-colors hover:text-negative disabled:opacity-50",
        className,
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
    </button>
  );
}
