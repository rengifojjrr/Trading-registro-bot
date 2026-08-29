"use client";

import { Check, Copy, Plus, RotateCcw, X } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addShoppingExtra,
  clearShoppingChecked,
  removeShoppingExtra,
  toggleShoppingItem,
} from "@/modules/meals/shopping-actions";
import {
  groupByAisle,
  toPlainText,
  type ShoppingLine,
} from "@/modules/meals/domain/shopping";
import { cn } from "@/lib/utils";

/**
 * La lista, dentro del supermercado.
 *
 * Tres cosas que la lista de sólo lectura no podía hacer: marcar lo que ya
 * está en el carro, añadir lo que no viene de ninguna comida, y agruparlo por
 * zona de la tienda para no cruzarla seis veces.
 *
 * Marcar es **optimista**: se tacha al tocarlo y se guarda después. En el súper
 * la cobertura va y viene, y una lista que tarda medio segundo en responder a
 * cada toque es una lista que se acaba llevando en papel.
 */
export function ShoppingList({
  lines,
  checked,
  extras,
}: {
  lines: ShoppingLine[];
  /** Las claves normalizadas de lo ya comprado. */
  checked: string[];
  extras: { id: string; name: string }[];
}) {
  const [pendiente, startTransition] = useTransition();
  const [comprados, marcarOptimista] = useOptimistic(
    new Set(checked),
    (actual: Set<string>, cambio: { key: string; comprado: boolean }) => {
      const siguiente = new Set(actual);
      if (cambio.comprado) siguiente.add(cambio.key);
      else siguiente.delete(cambio.key);
      return siguiente;
    },
  );

  const grupos = useMemo(() => groupByAisle(lines), [lines]);
  const quedan = lines.filter((l) => !comprados.has(l.key)).length;

  function alternar(linea: ShoppingLine) {
    const comprado = !comprados.has(linea.key);
    startTransition(async () => {
      marcarOptimista({ key: linea.key, comprado });
      await toggleShoppingItem(linea.name, comprado);
    });
  }

  async function copiar() {
    const texto = toPlainText(grupos, comprados);
    if (texto === "") {
      toast.info("No queda nada por comprar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Lista copiada. Ya se puede pegar donde quieras.");
    } catch {
      // El portapapeles necesita permiso y contexto seguro; sin él, decirlo en
      // vez de fallar en silencio.
      toast.error("Este navegador no dejó copiar al portapapeles.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {quedan === 0
            ? "Todo en el carro."
            : `Quedan ${quedan} de ${lines.length}.`}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void copiar()}>
            <Copy className="size-3.5" aria-hidden />
            Copiar
          </Button>
          {comprados.size > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => startTransition(() => void clearShoppingChecked())}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Empezar otra compra
            </Button>
          ) : null}
        </div>
      </div>

      {grupos.map((grupo) => (
        <section key={grupo.aisle} className="flex flex-col gap-1">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {grupo.label}
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {grupo.lines.map((linea) => {
              const comprado = comprados.has(linea.key);
              return (
                <li key={linea.key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={comprado}
                    onClick={() => alternar(linea)}
                    // 44px de alto: el mínimo cómodo para un dedo con el carro
                    // en la otra mano.
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/40"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                        comprado ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {comprado ? <Check className="size-3.5" /> : null}
                    </span>

                    <span className={cn("flex-1", comprado && "text-muted-foreground line-through")}>
                      {linea.name}
                      {linea.extra ? (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          añadido
                        </span>
                      ) : null}
                    </span>

                    <span
                      className={cn(
                        "tabular-nums text-muted-foreground",
                        comprado && "line-through",
                      )}
                    >
                      {linea.amount}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <AddExtra pendiente={pendiente} />

      {extras.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          <span className="w-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Añadidos a mano
          </span>
          {extras.map((extra) => (
            <span
              key={extra.id}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
            >
              {extra.name}
              <button
                type="button"
                onClick={() => startTransition(() => void removeShoppingExtra(extra.id))}
                aria-label={`Quitar ${extra.name} de la lista`}
                className="text-muted-foreground transition-colors hover:text-negative"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Añadir algo que no viene de ninguna comida.
 *
 * Un formulario de verdad y no un diálogo: en el súper se añade una cosa que
 * se acaba de recordar, y abrir una ventana para escribir «papel» es más
 * ceremonia de la que el caso aguanta.
 */
function AddExtra({ pendiente }: { pendiente: boolean }) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-fit gap-1.5 text-xs"
        onClick={() => setAbierto(true)}
      >
        <Plus className="size-3.5" aria-hidden />
        Añadir algo más
      </Button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await addShoppingExtra(formData);
        setAbierto(false);
      }}
      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-secondary/30 p-3"
    >
      <label className="flex flex-1 flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Qué</span>
        <Input name="name" required maxLength={80} autoFocus placeholder="Papel de cocina" className="h-8" />
      </label>
      <label className="flex w-20 flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Cuánto</span>
        <Input name="quantity" type="number" step="any" min="0" placeholder="2" className="h-8" />
      </label>
      <label className="flex w-20 flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Unidad</span>
        <Input name="unit" maxLength={20} placeholder="ud" className="h-8" />
      </label>
      <Button type="submit" size="sm" className="h-8" disabled={pendiente}>
        Añadir
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </form>
  );
}
