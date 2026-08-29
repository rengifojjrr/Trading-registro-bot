import { AlertTriangle, Check, Circle } from "lucide-react";
import Link from "next/link";

import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Card, CardContent } from "@/components/ui/card";
import type { SystemHealth } from "@/lib/pending/setup";
import { cn } from "@/lib/utils";

/**
 * Por dónde empezar, y si todo sigue funcionando.
 *
 * La misma lista sirve para las dos cosas, en dos momentos: el primer día dice
 * qué falta por configurar, y cualquier otro día dice si eso que se configuró
 * sigue yendo. Un panel de primeros pasos que desaparece para siempre al
 * completarse no sirve el día que algo se rompe.
 *
 * Cuando todo va bien se pliega a una línea. Un panel de seis filas verdes
 * ocupando media pantalla de inicio es ruido que se aprende a ignorar -- y
 * entonces tampoco se ve el día que una se pone roja.
 */
export function SetupPanel({ health }: { health: SystemHealth }) {
  const todoBien = health.pendientes === 0 && health.rotos === 0;

  // Con todo hecho y sin nada roto, ni siquiera se ofrece abrirlo: el resumen
  // es toda la información que hay.
  if (todoBien && !health.primeraVez) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="size-4 text-positive" aria-hidden />
        {health.summary}
      </p>
    );
  }

  return (
    <Card className={cn(health.rotos > 0 && "border-negative/40")}>
      <CardContent className="pt-5">
        <CollapsibleSection
          title={health.primeraVez ? "Primeros pasos" : "Estado del sistema"}
          subtitle={health.summary}
          // Abierto el primer día y cuando algo se rompió; plegado el resto
          // del tiempo.
          defaultOpen={health.primeraVez || health.rotos > 0}
        >
          <ul className="flex flex-col divide-y divide-border">
            {health.steps.map((step) => (
              <li key={step.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 shrink-0">
                  {step.state === "HECHO" ? (
                    <Check className="size-4 text-positive" aria-label="Hecho" />
                  ) : step.state === "ROTO" ? (
                    <AlertTriangle className="size-4 text-negative" aria-label="Con un problema" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" aria-label="Pendiente" />
                  )}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      step.state === "HECHO" && "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                  {/* La explicación sólo donde hace falta: en las hechas
                      sobra, y leerla seis veces enseña a saltarse el panel. */}
                  {step.state !== "HECHO" ? (
                    <span className="text-xs leading-snug text-muted-foreground">{step.detail}</span>
                  ) : null}
                </div>

                {step.state !== "HECHO" ? (
                  <Link
                    href={step.href}
                    className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    {step.actionLabel}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}
