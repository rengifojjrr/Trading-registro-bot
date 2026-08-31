import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDay, dayIsEmpty, type DaySummary } from "@/core/day";
import { colorVars } from "@/core/notion-colors";
import { longDateLabel, shiftDate, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Qué pasó un día.
 *
 * Una sola ficha para los cuatro calendarios -- contenido, tareas, trading y
 * el de la pantalla de inicio -- en lugar de una vista de día por cada uno.
 * Tres vistas distintas habrían sido tres sitios donde arreglar lo mismo, y
 * ninguna habría respondido la pregunta que se hace al pulsar un día: «qué
 * hice el jueves», que no distingue de qué módulo viene cada cosa.
 *
 * El orden es el del día vivido: primero cómo dormiste, luego lo que marcaste,
 * lo que tenías que hacer, lo que comiste, lo que leíste, lo que publicaste y
 * lo que operaste. Las secciones vacías no se pintan: un día tranquilo tiene
 * que verse tranquilo, no como una lista de siete «no hay nada».
 */
export default async function DayPage({ params }: { params: Promise<{ fecha: string }> }) {
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();

  const timezone = await userTimezone();
  const [day, today] = await Promise.all([fetchDay(fecha), todayIn(timezone)]);

  const empty = dayIsEmpty(day);

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Hoy
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <PageHeader
            title={fecha === today ? "Hoy" : longDateLabel(fecha)}
            description={
              empty
                ? "Este día no tiene nada registrado."
                : "Todo lo que registraste ese día, módulo a módulo."
            }
          />
          <DayNav date={fecha} today={today} />
        </div>
      </div>

      {empty ? null : (
        <div className="flex flex-col gap-4">
          <SleepSection day={day} />
          <HabitsSection day={day} />
          <TasksSection day={day} />
          <MealsSection day={day} />
          <ReadingSection day={day} />
          <ContentSection day={day} />
          <TradesSection day={day} />
        </div>
      )}
    </>
  );
}

/**
 * Ir al día anterior y al siguiente.
 *
 * Se puede pasar de hoy: a diferencia de los hábitos, aquí mirar mañana no es
 * registrar nada -- una tarea que vence el viernes es información legítima.
 */
function DayNav({ date, today }: { date: string; today: string }) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <Link
        href={`/dia/${shiftDate(date, -1)}` as Route}
        aria-label="Día anterior"
        className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      {date !== today ? (
        <Link
          href={`/dia/${today}` as Route}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Hoy
        </Link>
      ) : null}
      <Link
        href={`/dia/${shiftDate(date, 1)}` as Route}
        aria-label="Día siguiente"
        className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function Section({
  title,
  colorToken,
  href,
  linkLabel = "Ver el módulo",
  children,
}: {
  title: string;
  colorToken: string;
  href: Route;
  /** Para cuando el enlace no lleva al módulo entero sino a algo más concreto. */
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base" style={{ color: `var(${colorToken})` }}>
          {title}
        </CardTitle>
        <Link
          href={href}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {linkLabel}
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------- sueño

function SleepSection({ day }: { day: DaySummary }) {
  const sleep = day.sleep;
  if (!sleep) return null;

  const tags = [...sleep.beforeBed, ...sleep.wokeHow, ...sleep.moodOnWaking];

  return (
    <Section title="Sueño" colorToken="--mod-sleep" href="/sueno/historial">
      <Link
        href={`/sueno/historial/${sleep.id}` as Route}
        className="flex flex-col gap-2 rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="text-xl font-semibold tabular-nums"
            style={{ color: "var(--mod-sleep)" }}
          >
            {formatDuration(sleep.durationMinutes)}
          </span>
          {sleep.score !== null ? (
            <Badge variant="outline" className="tabular-nums">
              {sleep.score}/10
            </Badge>
          ) : null}
          {sleep.place ? (
            <span className="text-xs text-muted-foreground">{sleep.place}</span>
          ) : null}
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {sleep.dream ? (
          <p className="line-clamp-3 text-sm text-foreground/90">{sleep.dream}</p>
        ) : null}
      </Link>
    </Section>
  );
}

// -------------------------------------------------------------------- hábitos

function HabitsSection({ day }: { day: DaySummary }) {
  const done = day.habits.filter((h) => h.done);
  if (day.habits.length === 0) return null;

  return (
    <Section title="Hábitos" colorToken="--mod-habits" href="/habitos">
      <p className="text-sm text-muted-foreground">
        {done.length} de {day.habits.length} marcados.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {day.habits.map((habit) => (
          <Link
            key={habit.id}
            href={`/habitos/${habit.id}` as Route}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              habit.done
                ? "border-transparent text-mod-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            style={habit.done ? { backgroundColor: "var(--mod-habits)" } : undefined}
          >
            {habit.emoji ? `${habit.emoji} ` : ""}
            {habit.name}
          </Link>
        ))}
      </div>
    </Section>
  );
}

// --------------------------------------------------------------------- tareas

function TasksSection({ day }: { day: DaySummary }) {
  if (day.tasks.length === 0) return null;

  return (
    <Section title="Tareas" colorToken="--mod-tasks" href="/tareas/todas">
      {day.tasks.map((task) => (
        <Link
          key={task.id}
          href={`/tareas/${task.id}` as Route}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <span className={cn("text-sm", task.status === "HECHA" && "text-muted-foreground line-through")}>
            {task.icon ? `${task.icon} ` : ""}
            {task.title}
          </span>

          {task.projectName ? (
            <span
              className="rounded-full border px-2 py-0.5 text-xs"
              style={{
                ...colorVars(task.projectColor),
                borderColor: "var(--tag-color)",
                color: "var(--tag-color)",
              }}
            >
              {task.projectName}
            </span>
          ) : null}

          <span className="ml-auto text-xs text-muted-foreground">
            {task.completed ? "cerrada este día" : "vence este día"}
          </span>
        </Link>
      ))}
    </Section>
  );
}

// -------------------------------------------------------------------- comidas

const MEAL_LABELS = { DESAYUNO: "Desayuno", ALMUERZO: "Almuerzo", CENA: "Cena" } as const;

function MealsSection({ day }: { day: DaySummary }) {
  if (day.meals.length === 0) return null;

  return (
    <Section title="Comidas" colorToken="--mod-meals" href="/comidas">
      {day.meals.map((meal) => (
        <Link
          key={meal.id}
          href={`/comidas/${meal.id}` as Route}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <Badge variant="outline">{MEAL_LABELS[meal.mealType]}</Badge>
          <span className="text-sm">
            {meal.icon ? `${meal.icon} ` : ""}
            {meal.name}
          </span>
          {meal.ingredients > 0 ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {meal.ingredients} {meal.ingredients === 1 ? "ingrediente" : "ingredientes"}
            </span>
          ) : null}
        </Link>
      ))}
    </Section>
  );
}

// ------------------------------------------------------------------- lecturas

function ReadingSection({ day }: { day: DaySummary }) {
  if (day.reading.length === 0) return null;

  return (
    <Section title="Lecturas" colorToken="--mod-reading" href="/lecturas">
      {day.reading.map((session) => (
        <Link
          key={session.id}
          href={`/lecturas/${session.id}` as Route}
          className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{session.bookTitle ?? "Lectura suelta"}</span>
            <span
              className="ml-auto text-sm tabular-nums"
              style={{ color: "var(--mod-reading)" }}
            >
              {[
                session.minutes !== null ? `${session.minutes} min` : null,
                session.pages !== null ? `${session.pages} pág` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {session.summary ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{session.summary}</p>
          ) : null}
        </Link>
      ))}
    </Section>
  );
}

// ------------------------------------------------------------------ contenido

function ContentSection({ day }: { day: DaySummary }) {
  if (day.content.length === 0) return null;

  return (
    <Section title="Contenido" colorToken="--mod-content" href="/contenido">
      {day.content.map((piece) => (
        <Link
          key={piece.id}
          href={`/contenido/${piece.id}` as Route}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <span className="text-sm">
            {piece.icon ? `${piece.icon} ` : ""}
            {piece.title}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {piece.published ? "publicada este día" : "prevista este día"}
          </span>
        </Link>
      ))}
    </Section>
  );
}

// -------------------------------------------------------------------- trading

function TradesSection({ day }: { day: DaySummary }) {
  if (day.trades.length === 0) return null;

  // Sólo las que cerraron este día: son las que dejaron dinero este día. Sumar
  // también las que sólo se abrieron daría un total que no coincide con el
  // calendario de trading, y entre dos cifras distintas para lo mismo no hay
  // forma de saber cuál creerse.
  const cerradas = day.trades.filter((t) => t.closedThisDay);
  const total = cerradas.reduce((sum, trade) => sum + (trade.netPnl ?? 0), 0);

  return (
    <Section
      title="Operaciones"
      colorToken="--mod-trading"
      href={`/trading/dia/${day.date}` as Route}
      linkLabel="Ver el día de trading"
    >
      {cerradas.length > 0 ? (
        <p className="text-sm">
          {cerradas.length} {cerradas.length === 1 ? "cerrada" : "cerradas"} ·{" "}
          <span
            className={cn("font-medium tabular-nums", total < 0 ? "text-negative" : "text-positive")}
          >
            {formatMoney(total)}
          </span>
        </p>
      ) : null}

      {day.trades.map((trade) => (
        <Link
          key={trade.id}
          href={`/trades/${trade.id}` as Route}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <Badge variant="outline">{trade.direction === "LONG" ? "Larga" : "Corta"}</Badge>
          <span className="text-sm">{trade.productId}</span>
          {trade.status === "OPEN" ? (
            <span className="text-xs text-muted-foreground">abierta</span>
          ) : !trade.closedThisDay ? (
            <span className="text-xs text-muted-foreground">cerró otro día</span>
          ) : null}
          <span
            className={cn(
              "ml-auto text-sm tabular-nums",
              trade.closedThisDay
                ? (trade.netPnl ?? 0) < 0
                  ? "text-negative"
                  : "text-positive"
                : "text-muted-foreground",
            )}
          >
            {trade.netPnl === null || !trade.closedThisDay ? "--" : formatMoney(trade.netPnl)}
          </span>
        </Link>
      ))}
    </Section>
  );
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "--";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
