import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { RepairHistoryButton } from "@/components/trades/repair-history-button";
import { InfoHint } from "@/components/shared/info-hint";
import type { SyncStatus } from "@/lib/sync/read-status";
import { cn } from "@/lib/utils";

/**
 * Si lo que estás mirando es cierto, encima de lo que estás mirando.
 *
 * Tres cosas pueden hacer que una cifra sea mentira, y hasta ahora ninguna se
 * veía en el panel: que los datos sean viejos, que falte alguna ejecución por
 * registrar, o que la posición no coincida con la que Coinbase reporta. Se
 * podían dar las tres a la vez y el panel se veía perfectamente tranquilo --
 * que es literalmente lo que pasó durante ocho días.
 *
 * Cuando todo cuadra ocupa una línea y se calla. Un aviso permanente en verde
 * se vuelve invisible en dos días, y entonces el rojo tampoco se ve.
 */
export function SyncStatusBar({ status }: { status: SyncStatus }) {
  const { severity, health, fillGaps, positionMatches, autoSyncEnabled } = status;

  const Icono = severity === "ok" ? CheckCircle2 : severity === "watch" ? Clock : AlertTriangle;

  const problemas = [
    fillGaps > 0
      ? `Faltan ejecuciones de ${fillGaps} orden(es) por registrar; mientras tanto la posición no puede cuadrar.`
      : null,
    positionMatches === false
      ? "Los contratos que la aplicación cree abiertos no son los que dice Coinbase."
      : null,
    health.freshness === "STALE" || health.freshness === "NEVER" || health.freshness === "LATE"
      ? health.message
      : null,
  ].filter((p): p is string => p !== null);

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-sm",
        severity === "ok" && "border-border bg-card text-muted-foreground",
        severity === "watch" && "border-warning/40 bg-warning/5",
        severity === "alarm" && "border-negative/50 bg-negative/5",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 font-medium",
          severity === "ok" && "text-muted-foreground",
          severity === "watch" && "text-warning",
          severity === "alarm" && "text-negative",
        )}
      >
        <Icono className="size-4 shrink-0" aria-hidden />
        {severity === "ok"
          ? `Al día${health.ago ? ` · sincronizado ${health.ago}` : ""}`
          : problemas.length > 1
            ? `${problemas.length} cosas que revisar`
            : "Revisa esto antes de fiarte de las cifras"}
        <InfoHint label="Qué se comprueba">
          Tres cosas, y las tres tienen que cumplirse para que una cifra sea cierta: que los datos sean
          recientes, que no falte ninguna ejecución por registrar, y que los contratos abiertos coincidan
          con los que reporta Coinbase. Datos frescos que no cuadran son tan poco fiables como datos que
          cuadran y son de la semana pasada.
        </InfoHint>
      </p>

      {problemas.length > 0 ? (
        <ul className="flex min-w-0 flex-1 basis-full flex-col gap-1 text-xs text-muted-foreground">
          {problemas.map((problema) => (
            <li key={problema}>{problema}</li>
          ))}
        </ul>
      ) : null}

      {/* La reparación, aquí mismo. Un aviso que describe el problema y te
          manda a Configuración a buscar el remedio ya costó ocho días una vez. */}
      {fillGaps > 0 || positionMatches === false ? (
        <div className="basis-full">
          <RepairHistoryButton />
        </div>
      ) : null}

      {severity === "ok" && !autoSyncEnabled ? (
        <span className="basis-full text-xs text-muted-foreground">
          La sincronización automática está apagada; los datos se actualizan al abrir la aplicación.
        </span>
      ) : null}
    </div>
  );
}
