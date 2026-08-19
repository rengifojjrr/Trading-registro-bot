import { DateTime } from "luxon";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/modules/content/domain/content";
import { fetchPieces } from "@/modules/content/queries";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Contenido: calendario.
 *
 * La vista «Calendar - ALL» del calendario de Notion. Un mes entero, con cada
 * pieza en el día que tiene prevista.
 *
 * Es la única vista que responde «¿estoy publicando seguido o a rachas?», y
 * la respuesta no está en las piezas sino en los huecos: dos semanas en
 * blanco se ven aquí y en ninguna otra pantalla.
 */
export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const { mes } = await searchParams;

  const month = /^\d{4}-\d{2}$/.test(mes ?? "")
    ? DateTime.fromISO(`${mes}-01`)
    : DateTime.fromISO(today).startOf("month");

  const start = month.startOf("month");
  const end = month.endOf("month");
  // La rejilla empieza el lunes de la semana del día 1 y termina el domingo
  // de la del último: si no, el mes empieza en mitad de una fila y las
  // columnas dejan de ser días de la semana.
  const gridStart = start.minus({ days: start.weekday - 1 });
  const gridEnd = end.plus({ days: 7 - end.weekday });

  const pieces = await fetchPieces();
  const inMonth = pieces.filter(
    (p) => p.planned_date !== null && p.planned_date >= start.toISODate()! && p.planned_date <= end.toISODate()!,
  );
  const undated = pieces.filter((p) => p.planned_date === null && p.status !== "PUBLICADO");

  const days: DateTime[] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = cursor.plus({ days: 1 })) {
    days.push(cursor);
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        description={capitalise(month.setLocale("es").toFormat("LLLL 'de' yyyy"))}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile size="lg" label="Piezas este mes" value={String(inMonth.length)} sub="con fecha" />
        <StatTile
          size="lg"
          label="Publicadas"
          value={String(inMonth.filter((p) => p.status === "PUBLICADO").length)}
          sub="de las de este mes"
        />
        <StatTile size="lg" label="Sin fecha" value={String(undated.length)} sub="en la cola" />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/contenido/calendario?mes=${month.minus({ months: 1 }).toFormat("yyyy-MM")}`}
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          Mes anterior
        </Link>
        <Link
          href={`/contenido/calendario?mes=${month.plus({ months: 1 }).toFormat("yyyy-MM")}`}
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          Mes siguiente
        </Link>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <div className="grid min-w-[46rem] grid-cols-7 gap-1.5">
            {WEEKDAYS.map((label) => (
              <div key={label} className="pb-1 text-center text-xs font-medium text-muted-foreground">
                {label}
              </div>
            ))}

            {days.map((day) => {
              const iso = day.toISODate()!;
              const outside = day.month !== month.month;
              const items = inMonth.filter((p) => p.planned_date === iso);

              return (
                <div
                  key={iso}
                  className={cn(
                    "flex min-h-24 flex-col gap-1 rounded-lg border p-1.5",
                    outside ? "border-transparent opacity-40" : "border-border",
                  )}
                  style={iso === today ? { borderColor: "var(--mod-content)" } : undefined}
                >
                  <span className="text-xs tabular-nums text-muted-foreground">{day.day}</span>
                  {items.map((piece) => (
                    <span
                      key={piece.id}
                      title={`${piece.title} · ${STATUS_LABELS[piece.status]}`}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[0.7rem] leading-tight",
                        piece.status === "PUBLICADO"
                          ? "bg-accent text-muted-foreground line-through"
                          : "text-foreground",
                      )}
                      style={
                        piece.status === "PUBLICADO"
                          ? undefined
                          : { background: "color-mix(in oklab, var(--mod-content) 18%, transparent)" }
                      }
                    >
                      {piece.title}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {undated.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <h2 className="text-sm font-medium">Sin fecha · {undated.length}</h2>
            <p className="text-sm text-muted-foreground">
              No aparecen arriba porque no hay dónde ponerlas. Ponles fecha y el calendario deja de
              mentir sobre lo que viene.
            </p>
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {undated.slice(0, 20).map((piece) => (
                <li
                  key={piece.id}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {piece.title}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
