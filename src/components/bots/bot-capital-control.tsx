"use client";

import { Check, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cambiarCapital } from "@/app/(dashboard)/bots/simulador/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";

/**
 * El capital prestado a un bot, editable en su propia fila.
 *
 * Es una celda que se abre al pulsarla en vez de un campo siempre visible:
 * con dieciocho bots en pantalla, dieciocho cajas de texto convierten una
 * tabla que se lee de un vistazo en un formulario gigante donde además es
 * fácil cambiar la fila de al lado sin querer.
 *
 * Qué pasa cuando el número baja por debajo del patrimonio actual lo decide el
 * servidor, y está explicado en `cambiarCapital`: la diferencia se trata como
 * un ingreso o una retirada, nunca se toca lo que el bot ha ganado o perdido,
 * y no se deja sacar dinero que está metido en una posición abierta. Aquí no
 * se replica esa regla -- se enseña el error que devuelve --, porque una
 * segunda copia de la regla en el cliente es una copia que se queda vieja.
 */
export function BotCapitalControl({
  botId,
  nombre,
  capital,
  moneda,
  sugerido,
  bloqueado = false,
}: {
  botId: string;
  /** Para que el lector de pantalla diga de qué bot es este campo. */
  nombre: string;
  /** `null` cuando el bot todavía no tiene cuenta de papel abierta. */
  capital: number | null;
  moneda: string;
  /** El capital por defecto del usuario, que es lo que se propone la primera vez. */
  sugerido: number;
  bloqueado?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(capital ?? sugerido));
  const [guardando, iniciar] = useTransition();

  function abrir() {
    setValor(String(capital ?? sugerido));
    setEditando(true);
  }

  function guardar() {
    const numero = Number(valor.replace(",", "."));
    if (!Number.isFinite(numero) || numero < 0) {
      toast.error("Escribe una cantidad en dinero, sin signos.");
      return;
    }

    iniciar(async () => {
      const r = await cambiarCapital({ botId, capital: numero });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        capital === null
          ? `Cuenta de papel abierta con ${formatMoney(numero, { currency: moneda })}.`
          : `Capital de «${nombre}»: ${formatMoney(numero, { currency: moneda })}.`,
      );
      setEditando(false);
      router.refresh();
    });
  }

  if (!editando) {
    if (capital === null) {
      return (
        <Button size="sm" variant="outline" onClick={abrir} disabled={bloqueado}>
          <Plus className="size-4" aria-hidden />
          Abrir cuenta
        </Button>
      );
    }

    return (
      <button
        type="button"
        onClick={abrir}
        disabled={bloqueado}
        aria-label={`Cambiar el capital de ${nombre}`}
        className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 tabular-nums text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {formatMoney(capital, { currency: moneda, compact: true })}
        <Pencil
          className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        step={100}
        inputMode="decimal"
        autoFocus
        value={valor}
        disabled={guardando}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") setEditando(false);
        }}
        aria-label={`Capital de ${nombre}`}
        className="h-8 w-28 text-right tabular-nums"
      />
      <Button size="icon" variant="ghost" className="size-8" onClick={guardar} disabled={guardando} aria-label="Guardar el capital">
        <Check className="size-4" aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={() => setEditando(false)}
        disabled={guardando}
        aria-label="Dejarlo como estaba"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
