import { SemaforoBadge } from "@/components/bots/badges";
import type { HealthReading } from "@/lib/bots/semaforo";
import { BASELINE_SOURCE_LABELS, SEMAFORO_INSTRUCTIONS } from "@/lib/bots/types";

/**
 * El semáforo de un bot con su analítica: la ventana contra la línea base.
 *
 * Como un informe de sangre, cada marcador lleva su valor de referencia al
 * lado. Sin eso, «amarillo» es una opinión; con eso es «el profit factor
 * está al 70% de lo que prometió».
 */
export function HealthCard({ health }: { health: HealthReading }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SemaforoBadge state={health.state} />
        <span className="text-sm font-medium text-foreground">{SEMAFORO_INSTRUCTIONS[health.state]}</span>
      </div>

      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {health.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {health.comparisons.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Marcador</th>
                <th className="py-1 text-right font-medium">Ventana</th>
                <th className="py-1 text-right font-medium">
                  Línea base
                  {health.baselineSource !== "NINGUNA" ? (
                    <span className="ml-1 normal-case tracking-normal">
                      ({BASELINE_SOURCE_LABELS[health.baselineSource].toLowerCase()})
                    </span>
                  ) : null}
                </th>
                <th className="py-1 text-right font-medium">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {health.comparisons.map((c) => (
                <tr key={c.label} className="border-t border-border">
                  <td className="py-1.5 text-foreground">{c.label}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{c.rolling}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{c.baseline}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {c.ratio === null ? "--" : `${Math.round(c.ratio * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
