import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Un `<select>` del navegador con la ropa de `Input`.
 *
 * Los formularios de bots tienen desplegables con opción vacía («ninguna
 * estrategia», «la cuenta entera») y el `Select` de Radix no admite el valor
 * vacío. El nativo sí, se envía solo con el formulario y funciona igual de
 * bien con el teclado. Aquí no hay nada que Radix haga mejor.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
