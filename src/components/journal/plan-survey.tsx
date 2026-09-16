"use client";

import { AlertTriangle, ClipboardCheck, Target, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { terminarPlan } from "@/app/(dashboard)/trading/plan-actions";
import { Button } from "@/components/ui/button";
import { Encuesta } from "@/core/encuesta/encuesta";
import { resumen, type Respuesta, type Respuestas } from "@/core/encuesta/pasos";
import {
  aRespuestas,
  deRespuestas,
  nivelesAlReves,
  PLAN_LABELS,
  PLAN_STEPS,
  ratioDelPlan,
  type TradePlan,
} from "@/lib/journal/plan";
import type { PlanStepInput } from "@/lib/journal/plan-store";
import { cn } from "@/lib/utils";

/**
 * La encuesta de **antes** de entrar.
 *
 * El recorrido lo pone `core/encuesta`, el mismo motor que el cierre y el
 * sueño; lo de aquí es lo que sólo vale para un plan: el cuadro, y la cuenta de
 * riesgo/beneficio que se enseña mientras lo escribes.
 *
 * Esa cuenta es la mitad del valor de todo esto. Un «0,4 a 1» en la pantalla,
 * **antes** de entrar, es la única forma de que alguien se replantee el
 * objetivo; enseñárselo al cerrar es contarle por qué perdió dinero cuando ya
 * lo ha perdido.
 */
export function PlanSurvey({ plan, onClose }: { plan: TradePlan; onClose: () => void }) {
  const [respuestas, setRespuestas] = useState<Respuestas>(() => aRespuestas(plan.answers));
  const [fotoUrl, setFotoUrl] = useState<string | null>(plan.fotoUrl);
  const [guardando, startSaving] = useTransition();
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const terminadaRef = useRef(false);

  const cambiar = useCallback((id: string, valor: Respuesta) => {
    setRespuestas((previas) => ({ ...previas, [id]: valor }));
  }, []);

  const guardar = useCallback(
    (id: string, valor: Respuesta) => {
      const entrada = entradaDelPaso(id, valor);
      if (!entrada) return;
      startSaving(async () => {
        try {
          // Un `fetch` y no una Server Action: una acción refresca la ruta y el
          // panel volvería a buscar el plan pendiente, desmontando el cuadro a
          // media encuesta. Es el mismo arreglo que en la encuesta del cierre.
          const res = await fetch(`/api/planes/${plan.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(entrada),
          });
          const data = (await res.json()) as { error: string | null };
          if (data.error) toast.error(data.error);
        } catch {
          toast.error("No se pudo guardar la respuesta.");
        }
      });
    },
    [plan.id],
  );

  const subirFoto = useCallback(
    (paso: string, file: File) => {
      // La miniatura sale del archivo local, sin esperar a la red: verla al
      // instante es lo que hace que subir una foto no se sienta como un envío.
      //
      // Dentro de un try porque no está en todas partes -- jsdom no lo trae, y
      // tampoco la captura de miniaturas --, y quedarse sin vista previa es
      // molesto mientras que quedarse sin poder subir la foto es que no
      // funciona.
      try {
        setFotoUrl(URL.createObjectURL(file));
      } catch {
        setFotoUrl(null);
      }
      setSubiendoFoto(true);

      void (async () => {
        try {
          const cuerpo = new FormData();
          cuerpo.set("file", file);
          const res = await fetch(`/api/planes/${plan.id}/foto`, { method: "POST", body: cuerpo });
          const data = (await res.json()) as { error: string | null; ruta: string | null; url: string | null };
          if (data.error || !data.ruta) {
            toast.error(data.error ?? "No se pudo subir la imagen.");
            setFotoUrl(null);
            return;
          }
          cambiar(paso, data.ruta);
          if (data.url) setFotoUrl(data.url);
        } catch {
          toast.error("No se pudo subir la imagen.");
          setFotoUrl(null);
        } finally {
          setSubiendoFoto(false);
        }
      })();
    },
    [plan.id, cambiar],
  );

  const cerrar = useCallback(() => {
    onClose();
    // Sin esperar: el cuadro desaparece al instante y el cierre viaja por
    // detrás. Que el botón de cerrar tarde medio segundo es lo único que no se
    // le perdona a un cuadro que ocupa la pantalla entera.
    void terminarPlan(plan.id);
  }, [onClose, plan.id]);

  const answers = useMemo(() => deRespuestas(respuestas), [respuestas]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={cerrar}
      onKeyDown={(event) => {
        if (event.key === "Escape") cerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Plan de la próxima operación"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-gradient-to-br from-primary/10 via-card to-card px-5 pb-4 pt-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Antes de entrar</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lo que escribas ahora es lo que después dirá si seguiste tu plan.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar el plan"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="px-5 pb-5 pt-4">
          <Encuesta
            pasos={PLAN_STEPS}
            respuestas={respuestas}
            onCambio={cambiar}
            onGuardar={guardar}
            onTerminar={() => {
              terminadaRef.current = true;
            }}
            guardando={guardando}
            onSubirImagen={subirFoto}
            imagenes={fotoUrl ? { foto: fotoUrl } : undefined}
            subiendoImagen={subiendoFoto}
            bajoLaPregunta={<Cuentas answers={answers} />}
            final={<Final respuestas={respuestas} onCerrar={cerrar} />}
          />
        </div>
      </div>
    </div>
  );
}

/** Qué mandarle al servidor por cada respuesta, ya en el tipo que espera. */
function entradaDelPaso(id: string, valor: Respuesta): PlanStepInput | null {
  const numero = typeof valor === "number" && Number.isFinite(valor) ? valor : null;
  const texto = typeof valor === "string" ? valor : "";

  if (id === "direccion") {
    return { step: "direccion", value: texto === "LONG" || texto === "SHORT" ? texto : "" };
  }
  if (id === "idea") return { step: "idea", value: texto };
  if (id === "entrada") return { step: "entrada", value: numero };
  if (id === "stop") return { step: "stop", value: numero };
  if (id === "objetivo") return { step: "objetivo", value: numero };
  if (id === "riesgo") return { step: "riesgo", value: numero };
  if (id === "animo") {
    return { step: "animo", value: Array.isArray(valor) ? valor.map(String) : [] };
  }
  if (id === "foto") return { step: "foto", value: texto };
  return null;
}

/**
 * Lo que sale de lo que llevas escrito.
 *
 * Aparece sola cuando hay con qué calcularla y desaparece cuando no: un
 * recuadro que dice «--» en cada pregunta es ruido, y uno que aparece justo al
 * teclear el objetivo es una respuesta.
 */
function Cuentas({ answers }: { answers: ReturnType<typeof deRespuestas> }) {
  const ratio = ratioDelPlan(answers);
  const alReves = nivelesAlReves(answers);

  if (!alReves && ratio === null) return null;

  if (alReves) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        <span>
          {/* No se impide: puede ser una estrategia rara o un precio a medio
              teclear. Se dice, que es lo que hace falta para verlo. */}
          Con esa dirección, el stop o el objetivo están del lado contrario. Compruébalos.
        </span>
      </p>
    );
  }

  const bueno = (ratio ?? 0) >= 2;
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        bueno ? "border-positive/40 bg-positive/10" : "border-border bg-secondary/40",
      )}
    >
      <Target className={cn("size-3.5 shrink-0", bueno ? "text-positive" : "text-muted-foreground")} aria-hidden />
      <span>
        Ganas <strong className="tabular-nums">{ratio!.toFixed(1)}</strong> por cada 1 que arriesgas
        {bueno ? "." : ", según estos precios."}
      </span>
    </p>
  );
}

/**
 * Lo planificado, al acabar.
 *
 * Y la frase que importa: queda esperando. Sin ella, el cuadro se cierra y no
 * queda claro si eso que acabas de escribir sirvió para algo.
 */
function Final({ respuestas, onCerrar }: { respuestas: Respuestas; onCerrar: () => void }) {
  const lineas = resumen(PLAN_STEPS, respuestas, PLAN_LABELS);

  return (
    <div className="flex flex-col gap-4 py-1">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ClipboardCheck className="size-4.5" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-semibold leading-snug">
            {lineas.length > 0 ? "Plan guardado" : "Sin plan, entonces"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {lineas.length > 0
              ? "Se queda esperando. Al cerrar tu próxima operación se te preguntará si es ésta."
              : "No has escrito nada, y no pasa nada. El botón sigue ahí cuando lo quieras."}
          </p>
        </div>
      </div>

      {lineas.length > 0 ? (
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm">
          {lineas.map((linea) => (
            <div key={linea.etiqueta} className="flex gap-2">
              <dt className="w-20 shrink-0 text-xs text-muted-foreground">{linea.etiqueta}</dt>
              <dd className="min-w-0 flex-1 text-pretty">{linea.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="button" size="sm" onClick={onCerrar}>
          Listo
        </Button>
      </div>
    </div>
  );
}
