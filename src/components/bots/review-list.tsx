import { CADENCE_LABELS, type ReviewSession } from "@/lib/bots/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Las revisiones que vienen, agrupadas por domingo.
 *
 * Cada una con su lista y su duración, para que la de veinte minutos dure
 * veinte minutos. La de hoy se destaca: es la única que hay que hacer.
 */
export function ReviewList({ sessions, timezone }: { sessions: ReviewSession[]; timezone: string }) {
  const porDia = new Map<string, ReviewSession[]>();
  for (const s of sessions) {
    const lista = porDia.get(s.date) ?? [];
    lista.push(s);
    porDia.set(s.date, lista);
  }

  if (porDia.size === 0) {
    return <p className="text-sm text-muted-foreground">Nada en el horizonte.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {[...porDia.entries()].map(([date, delDia]) => {
        const hoy = delDia[0].isToday;
        const dias = delDia[0].daysUntil;
        const minutos = delDia.reduce((acc, s) => acc + s.minutes, 0);
        return (
          <li
            key={date}
            className={cn("rounded-lg border p-4", hoy ? "border-primary bg-primary/5" : "border-border")}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{fechaLarga(date, timezone)}</span>
                {hoy ? <Badge variant="default">Hoy</Badge> : null}
              </div>
              <span className="text-xs text-muted-foreground">
                {hoy ? "" : dias === 1 ? "mañana · " : `en ${dias} días · `}
                {minutos} min
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {delDia.map((s) => (
                <div key={s.cadence} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{CADENCE_LABELS[s.cadence]}</Badge>
                    <span className="text-sm font-medium text-foreground">{s.title}</span>
                    <span className="text-xs text-muted-foreground">{s.minutes} min</span>
                  </div>
                  <ul className="ml-4 list-disc text-sm text-muted-foreground">
                    {s.checklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function fechaLarga(date: string, timezone: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: timezone === "UTC" ? "UTC" : undefined })
    .format(d)
    .replace(/^\w/, (c) => c.toUpperCase());
}
