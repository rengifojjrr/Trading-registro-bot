"use client";

import { ClipboardList, Loader2, Pencil, Target, Trash2 } from "lucide-react";
import { DateTime } from "luxon";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { empezarPlan, tirarPlan } from "@/app/(dashboard)/trading/plan-actions";
import { PlanSurvey } from "@/components/journal/plan-survey";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PLAN_VACIO, ratioDelPlan, resumenCorto, type TradePlan } from "@/lib/journal/plan";
import { cn } from "@/lib/utils";

/**
 * «Planificar el próximo trade», y el plan que quedó esperando.
 *
 * Un botón grande y no una opción escondida en un menú: el momento de
 * planificar es mientras miras el gráfico decidiendo, con prisa, y lo que hay
 * que hacer entonces tiene que verse desde el otro lado de la habitación. Es
 * también lo único de este panel que se hace **antes** de operar, así que va
 * arriba del todo.
 *
 * Con un plan esperando, el botón se convierte en el plan. Enseñarlo es la
 * mitad de para qué sirve: un plan que hay que ir a buscar a otra pantalla es
 * un plan que se olvida justo cuando toca respetarlo.
 */
export function PlanLauncher({
  plan,
  productId,
}: {
  plan: TradePlan | null;
  /** Qué se opera aquí, para no preguntarlo. */
  productId: string | null;
}) {
  const [abierto, setAbierto] = useState<TradePlan | null>(null);
  const [empezando, startEmpezando] = useTransition();
  const [tirando, startTirando] = useTransition();

  function abrirNuevo() {
    startEmpezando(async () => {
      const { id, error } = await empezarPlan(productId);
      if (error || !id) {
        toast.error(error ?? "No se pudo empezar el plan.");
        return;
      }
      setAbierto({ id, createdAt: new Date().toISOString(), answers: { ...PLAN_VACIO }, fotoUrl: null });
    });
  }

  return (
    <>
      {plan ? (
        <PlanPendiente
          plan={plan}
          tirando={tirando}
          onEditar={() => setAbierto(plan)}
          onTirar={() =>
            startTirando(async () => {
              const { error } = await tirarPlan(plan.id);
              if (error) toast.error(error);
            })
          }
        />
      ) : (
        <Button
          type="button"
          size="lg"
          onClick={abrirNuevo}
          disabled={empezando}
          className="h-14 w-full text-base"
        >
          {empezando ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <ClipboardList className="size-5" aria-hidden />
          )}
          Planificar el próximo trade
        </Button>
      )}

      {abierto ? <PlanSurvey plan={abierto} onClose={() => setAbierto(null)} /> : null}
    </>
  );
}

/**
 * El plan que está esperando.
 *
 * Con la cuenta de riesgo/beneficio delante, porque es el número que hace que
 * un plan escrito valga más que un plan pensado. Y con la foto, que es lo que
 * de verdad te devuelve a lo que estabas viendo.
 */
function PlanPendiente({
  plan,
  tirando,
  onEditar,
  onTirar,
}: {
  plan: TradePlan;
  tirando: boolean;
  onEditar: () => void;
  onTirar: () => void;
}) {
  const ratio = ratioDelPlan(plan.answers);
  const cuando = DateTime.fromISO(plan.createdAt).toRelative({ locale: "es" });
  const linea = resumenCorto(plan.answers);

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Target className="size-3.5 text-primary" aria-hidden />
              Tienes un plan esperando
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {linea || "Sin precios todavía"}
              {cuando ? ` · ${cuando}` : ""}
            </p>
          </div>

          {ratio !== null ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums",
                ratio >= 2
                  ? "border-positive/40 bg-positive/10 text-positive"
                  : "border-border text-muted-foreground",
              )}
              title="Cuánto ganas por cada 1 que arriesgas, según tu plan"
            >
              {ratio.toFixed(1)} : 1
            </span>
          ) : null}
        </div>

        {plan.answers.idea ? (
          <p className="text-pretty text-sm leading-relaxed">{plan.answers.idea}</p>
        ) : null}

        {plan.fotoUrl ? (
          // Una imagen del almacén, con dirección firmada y tamaño desconocido:
          // `next/image` pide dimensiones o un dominio configurado y aquí no
          // hay ninguno de los dos.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plan.fotoUrl}
            alt="El gráfico que guardaste con el plan"
            className="max-h-56 w-full rounded-lg border border-border object-contain"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEditar}>
            <Pencil className="size-3.5" aria-hidden />
            Seguir con el plan
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTirar}
            disabled={tirando}
            className="text-muted-foreground"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Descartarlo
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Al cerrar tu próxima operación se te preguntará si es ésta.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
