import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { formatSleepDuration } from "@/modules/sleep/domain/sleep";
import type { SleepEntryRow } from "@/modules/sleep/queries";

/**
 * Las noches anteriores.
 *
 * La duración va primero y grande porque es la cifra que se busca al abrir
 * esto. El sueño narrado se muestra entero, sin recortar: recortarlo obliga
 * a abrir cada noche para leer justo lo que se venía a leer.
 */
export function SleepHistory({ entries, timezone }: { entries: SleepEntryRow[]; timezone: string }) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Todavía no hay noches registradas. La primera que guardes ya te da una duración real.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="flex flex-col gap-3 pt-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span
                className="text-2xl font-semibold tabular-nums"
                style={{ color: "var(--mod-sleep)" }}
              >
                {formatSleepDuration(entry.duration_minutes)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatDate(`${entry.sleep_date}T00:00:00Z`, timezone)}
              </span>
              {entry.score !== null ? (
                <Badge variant="outline" className="ml-auto tabular-nums">
                  {entry.score}/10
                </Badge>
              ) : null}
            </div>

            {entry.dream ? (
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{entry.dream}</p>
            ) : null}

            {[...entry.before_bed, ...entry.woke_how, ...entry.mood_on_waking].length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {entry.before_bed.map((tag) => (
                  <Tag key={`b-${tag}`} label={tag} />
                ))}
                {entry.woke_how.map((tag) => (
                  <Tag key={`w-${tag}`} label={tag} />
                ))}
                {entry.mood_on_waking.map((tag) => (
                  <Tag key={`m-${tag}`} label={tag} />
                ))}
              </div>
            ) : null}

            {entry.notes || entry.place ? (
              <p className="text-xs text-muted-foreground">
                {[entry.place, entry.notes].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}
