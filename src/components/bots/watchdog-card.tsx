import { PhaseBadge } from "@/components/bots/badges";
import { Badge } from "@/components/ui/badge";
import {
  PULSO_INSTRUCCIONES,
  PULSO_LABELS,
  type EstadoDelPulso,
  type LecturaDelPulso,
  type ResumenDelWatchdog,
} from "@/lib/bots/watchdog";
import { cn } from "@/lib/utils";

/**
 * El watchdog: un pulsómetro, no un medidor de rentabilidad.
 *
 * Cada fila compara las operaciones que el bot prometió hacer con las que ha
 * hecho de verdad. La barra tiene la marca de lo prometido en el centro, así
 * que de un vistazo se ve quién se queda corto y quién se pasa: lo que se mira
 * es la distancia a la marca, no la cifra.
 *
 * Ordenado ya desde el módulo puro, con los rotos delante.
 */
export function WatchdogCard({ resumen }: { resumen: ResumenDelWatchdog }) {
  if (resumen.lecturas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ningún bot en la cantera ni en el equipo. Cuando haya alguno se le toma el pulso aquí.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {resumen.alertas.length > 0 ? (
        <p className="text-sm text-foreground">
          <span className="font-medium">
            {resumen.alertas.length} bot{resumen.alertas.length === 1 ? "" : "s"} fuera de ritmo
          </span>{" "}
          en los últimos {resumen.dias} días. Un bot parado no pierde dinero, y por eso ninguna métrica de
          rentabilidad lo detecta.
        </p>
      ) : resumen.sanos > 0 ? (
        <p className="text-sm text-foreground">
          Los {resumen.sanos} bot{resumen.sanos === 1 ? "" : "s"} con ritmo declarado laten como prometieron en los
          últimos {resumen.dias} días.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ningún bot tiene todavía un ritmo declarado contra el que comparar.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {resumen.lecturas.map((lectura) => (
          <FilaDelPulso key={lectura.botId} lectura={lectura} />
        ))}
      </ul>

      {resumen.sinRitmo > 0 ? (
        <p className="text-xs text-muted-foreground">
          {resumen.sinRitmo} bot{resumen.sinRitmo === 1 ? " no tiene" : "s no tienen"} ritmo declarado. Ponle las
          operaciones al mes en su línea base y el watchdog podrá vigilarlo.
        </p>
      ) : null}
    </div>
  );
}

function FilaDelPulso({ lectura }: { lectura: LecturaDelPulso }) {
  const alerta = lectura.estado === "SILENCIOSO" || lectura.estado === "HIPERACTIVO";

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-md border px-3 py-2",
        lectura.estado === "SILENCIOSO"
          ? "border-negative/50 bg-negative/5"
          : lectura.estado === "HIPERACTIVO"
            ? "border-warning/50 bg-warning/5"
            : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{lectura.nombre}</span>
        <PhaseBadge phase={lectura.fase} />
        <PulsoBadge estado={lectura.estado} />
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{lectura.observadas}</span>
          {lectura.esperadas === null ? "" : ` de ${lectura.esperadas.toFixed(0)}`}
          <span className="ml-1 text-xs">en {lectura.dias} días</span>
        </span>
      </div>

      <BarraDelPulso ratio={lectura.ratio} estado={lectura.estado} />

      <p className="text-xs text-muted-foreground">
        {lectura.motivo}
        {alerta ? <span className="text-foreground"> {PULSO_INSTRUCCIONES[lectura.estado]}</span> : null}
      </p>
    </li>
  );
}

/**
 * La barra, con lo prometido en la mitad.
 *
 * A media escala para que quepa el doble de lo prometido: un bot hiperactivo
 * también se ve, y no sólo como una barra llena igual que la de uno sano.
 */
function BarraDelPulso({ ratio, estado }: { ratio: number | null; estado: EstadoDelPulso }) {
  if (ratio === null) return null;

  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn(
          "h-full rounded-full",
          estado === "SILENCIOSO" ? "bg-negative" : estado === "HIPERACTIVO" ? "bg-warning" : "bg-primary",
        )}
        style={{ width: `${Math.min(100, Math.max(1, ratio * 50))}%` }}
      />
      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-foreground/60" aria-hidden />
    </div>
  );
}

function PulsoBadge({ estado }: { estado: EstadoDelPulso }) {
  const variant =
    estado === "SANO"
      ? "positive"
      : estado === "SILENCIOSO"
        ? "negative"
        : estado === "HIPERACTIVO"
          ? "warning"
          : "outline";

  return (
    <Badge variant={variant}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {PULSO_LABELS[estado]}
    </Badge>
  );
}
