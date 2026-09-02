import type { KillSwitchReading } from "@/lib/bots/killswitch";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * La escalera de emergencia, con el escalón en el que está el portfolio.
 *
 * Se pintan los cuatro escalones siempre, activos o no: la escalera se
 * decide antes del viaje, y verla entera cuando todo va bien es lo que hace
 * que el día que se active no haya nada que discutir.
 */
export function KillSwitchLadder({
  reading,
  drawdownMoney,
  currency,
}: {
  reading: KillSwitchReading;
  drawdownMoney: number;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            reading.level === 0 ? "text-foreground" : reading.level === 1 ? "text-warning" : "text-negative",
          )}
        >
          {reading.drawdownPct === null ? "--" : `${reading.drawdownPct.toFixed(1)}%`}
        </span>
        <span className="text-sm text-muted-foreground">
          de drawdown del equipo
          {drawdownMoney > 0 ? ` (${formatMoney(drawdownMoney, { currency })} desde el máximo)` : ""}
        </span>
      </div>

      <p className="text-sm text-foreground">
        <span className="font-medium">{reading.label}.</span> {reading.instruction}
        {reading.next && reading.drawdownPct !== null ? (
          <span className="text-muted-foreground">
            {" "}
            Quedan {(reading.next.threshold - reading.drawdownPct).toFixed(1)} puntos hasta «{reading.next.label.toLowerCase()}».
          </span>
        ) : null}
      </p>

      <ol className="flex flex-col gap-1.5">
        {reading.steps.map((step) => {
          const activo = reading.level >= step.level;
          const actual = reading.level === step.level;
          return (
            <li
              key={step.level}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
                actual ? "border-negative/60 bg-negative/10" : activo ? "border-border bg-secondary/40" : "border-border",
              )}
              aria-current={actual ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  activo ? "bg-negative text-white" : "bg-secondary text-muted-foreground",
                )}
              >
                {step.level}
              </span>
              <span className="w-24 shrink-0 font-medium text-foreground">{step.label}</span>
              <span className="w-14 shrink-0 tabular-nums text-muted-foreground">&gt; {step.threshold}%</span>
              <span className="text-muted-foreground">{step.instruction}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
