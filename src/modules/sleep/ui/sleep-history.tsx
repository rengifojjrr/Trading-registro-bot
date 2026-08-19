import { ArrowRight, MoonStar, Sunrise } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { clockFromTimestamp, formatSleepDuration } from "@/modules/sleep/domain/sleep";
import type { SleepEntryRow } from "@/modules/sleep/queries";

/**
 * Las noches anteriores.
 *
 * La duración va primero y grande porque es la cifra que se busca al abrir
 * esto. Al lado, las dos horas del reloj: estaban guardadas y no se enseñaban
 * en ningún sitio, y son justo de donde sale todo lo demás -- una duración de
 * siete horas no dice si fueron de la una a las ocho o de las cuatro a las
 * once.
 *
 * El sueño narrado sale entero, sin recortar: recortarlo obliga a abrir cada
 * noche para leer justo lo que se venía a leer.
 *
 * La tarjeta entera es el enlace. Antes sólo lo era un «Abrir» en la esquina,
 * que en el móvil es un objetivo de un centímetro justo donde lo natural es
 * tocar la tarjeta.
 */
export function SleepHistory({
  entries,
  timezone,
}: {
  entries: SleepEntryRow[];
  timezone: string;
}) {
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
        <Card key={entry.id} className="transition-colors hover:bg-muted/40">
          <Link href={`/sueno/historial/${entry.id}` as Route} className="block">
            <CardContent className="flex flex-col gap-3 pt-5">
              <NightHeader entry={entry} timezone={timezone} />

              {entry.self_reported ? (
                <p className="text-xs text-muted-foreground">
                  Tú apuntaste: {entry.self_reported}
                </p>
              ) : null}

              {entry.dream ? (
                <p className="whitespace-pre-wrap text-sm text-foreground/90">{entry.dream}</p>
              ) : null}

              <NightTags entry={entry} />

              {entry.notes || entry.place ? (
                <p className="text-xs text-muted-foreground">
                  {[entry.place, entry.notes].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </CardContent>
          </Link>
        </Card>
      ))}
    </div>
  );
}

function NightHeader({ entry, timezone }: { entry: SleepEntryRow; timezone: string }) {
  const bedtime = clockFromTimestamp(entry.slept_at, timezone);
  const wake = clockFromTimestamp(entry.woke_at, timezone);

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--mod-sleep)" }}>
        {formatSleepDuration(entry.duration_minutes)}
      </span>

      {bedtime || wake ? (
        <span className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
          <MoonStar className="size-3.5" aria-hidden />
          {bedtime || "—"}
          <ArrowRight className="size-3" aria-hidden />
          <Sunrise className="size-3.5" aria-hidden />
          {wake || "—"}
        </span>
      ) : null}

      <span className="text-sm text-muted-foreground">
        {formatDate(`${entry.sleep_date}T00:00:00Z`, timezone)}
      </span>

      {entry.score !== null ? (
        <Badge variant="outline" className="ml-auto tabular-nums">
          {entry.score}/10
        </Badge>
      ) : null}
    </div>
  );
}

function NightTags({ entry }: { entry: SleepEntryRow }) {
  // Las tres listas se pintan juntas porque al releer una noche no importa de
  // qué campo salió cada etiqueta, sino que estaban todas.
  const tags = [
    ...entry.before_bed.map((label) => ({ key: `b-${label}`, label })),
    ...entry.woke_how.map((label) => ({ key: `w-${label}`, label })),
    ...entry.mood_on_waking.map((label) => ({ key: `m-${label}`, label })),
  ];

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.key}
          className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
}
