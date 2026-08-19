"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { shiftDate } from "@/core/today";
import { nightLabel } from "@/modules/sleep/domain/sleep";

/**
 * Qué noche se está registrando.
 *
 * Vive en la URL (`?noche=2026-08-18`) y no en el estado del componente por
 * dos razones: la página tiene que ir al servidor a buscar esa noche de todos
 * modos, y así «apuntar la del sábado» es un enlace que se puede guardar.
 *
 * El día siguiente se bloquea al llegar a la última noche disponible: la
 * noche de hoy aún no ha pasado, y ofrecer registrarla invita a inventarse un
 * dato.
 */
export function NightPicker({ date, latest }: { date: string; latest: string }) {
  const router = useRouter();

  function go(next: string) {
    router.push(`/sueno?noche=${next}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Noche anterior"
        onClick={() => go(shiftDate(date, -1))}
      >
        <ChevronLeft />
      </Button>

      <div className="flex flex-1 flex-col items-center">
        <span className="text-sm font-medium text-foreground">{nightLabel(date)}</span>
        <input
          type="date"
          value={date}
          max={latest}
          onChange={(event) => {
            if (event.target.value) go(event.target.value);
          }}
          aria-label="Elegir otra noche"
          className="bg-transparent text-xs text-muted-foreground outline-none"
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Noche siguiente"
        disabled={date >= latest}
        onClick={() => go(shiftDate(date, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
