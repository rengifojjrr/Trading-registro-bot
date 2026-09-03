"use client";

import { Sprout } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { sembrarBiblioteca } from "@/app/(dashboard)/bots/simulador/actions";
import { Button } from "@/components/ui/button";

/**
 * Mete toda la biblioteca en la cantera, lista para operar en papel.
 *
 * Se puede pulsar las veces que haga falta: las reglas y la ficha de cada bot
 * se actualizan -- así una corrección de la biblioteca llega a los bots ya
 * creados -- pero la cuenta de un bot que ya existe no se toca. El capital que
 * le pusiste y si está encendido son decisiones tuyas, y volver a sembrar no
 * es motivo para deshacerlas.
 */
export function SembrarBibliotecaBoton({ cuantas, yaCreados }: { cuantas: number; yaCreados: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const faltan = cuantas - yaCreados;

  function sembrar() {
    startTransition(async () => {
      const r = await sembrarBiblioteca();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (r.creados && r.creados > 0) {
        toast.success(`${r.creados} bot${r.creados === 1 ? "" : "s"} en la cantera.`, {
          description: "Nacen apagados y con 10.000 de papel. Enciéndelos desde el simulador cuando hayas leído qué hacen.",
        });
      } else {
        toast.success("Fichas y reglas actualizadas.", {
          description: "No había ningún bot nuevo que crear.",
        });
      }
      router.refresh();
    });
  }

  return (
    <Button size="sm" onClick={sembrar} disabled={isPending}>
      <Sprout className="size-4" aria-hidden />
      {isPending
        ? "Sembrando…"
        : faltan > 0
          ? `Poner ${faltan} en la cantera`
          : "Actualizar las fichas"}
    </Button>
  );
}
