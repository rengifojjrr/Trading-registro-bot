"use client";

import { Loader2, Ruler } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Lo que devuelve la acción de medir, para poder contarlo al acabar. */
export interface ResumenDeMedicion {
  medidas: number;
  sinHistorico: number;
  fallidas: string[];
}

/**
 * Medir las estrategias que no tienen cifras.
 *
 * Es un botón y no algo que pase al abrir la pantalla porque tarda: cada
 * estrategia encadena hasta doce peticiones a la API pública de Coinbase, y se
 * miden en serie para no lanzarle ciento treinta llamadas a la vez a un
 * servicio que no es nuestro. Una página que tardara eso en aparecer sería
 * peor que un botón que avisa de que está trabajando.
 *
 * Al acabar dice cuántas midió y **nombra** las que no pudo. Un «2 no se
 * pudieron medir» no se puede accionar; con el nombre delante se ve enseguida
 * que son las de seis horas, o las de un producto que Coinbase ya no lista.
 */
export function MedirBiblioteca({
  cuantas,
  medir,
}: {
  /** Cuántas están sin cifras ahora mismo. */
  cuantas: number;
  medir: () => Promise<ResumenDeMedicion>;
}) {
  const [trabajando, empezar] = useTransition();
  const [hecho, setHecho] = useState(false);

  if (cuantas === 0 && !hecho) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={trabajando || cuantas === 0}
        onClick={() =>
          empezar(async () => {
            try {
              const resumen = await medir();
              setHecho(true);

              if (resumen.medidas === 0 && resumen.fallidas.length === 0) {
                toast.info("No quedaba ninguna por medir.");
                return;
              }

              toast.success(
                resumen.medidas === 1 ? "Medida 1 estrategia." : `Medidas ${resumen.medidas} estrategias.`,
                resumen.fallidas.length > 0
                  ? {
                      description: `Sin histórico suficiente: ${resumen.fallidas.join(", ")}.`,
                      duration: 10_000,
                    }
                  : undefined,
              );
            } catch {
              // La medición pide datos a un servicio de fuera; que falle es
              // normal y no puede dejar el botón girando para siempre.
              toast.error("No se pudo medir. Vuelve a intentarlo en un momento.");
            }
          })
        }
      >
        {trabajando ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Ruler className="size-4" aria-hidden />
        )}
        {trabajando
          ? "Midiendo…"
          : cuantas === 1
            ? "Medir la que falta"
            : `Medir las ${cuantas} que faltan`}
      </Button>

      <span className="text-xs text-muted-foreground">
        {trabajando
          ? "Trae el histórico de cada una y lo pasa por el motor de backtest. Tarda."
          : "Sobre histórico real, con el mismo motor con el que se midieron las demás."}
      </span>
    </div>
  );
}
