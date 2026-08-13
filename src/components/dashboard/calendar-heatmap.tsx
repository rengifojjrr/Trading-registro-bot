import { DateTime } from "luxon";
import Link from "next/link";

import type { DailyPnl } from "@/lib/analytics/stats";
import { formatSignedMoney, pnlColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS_ES = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Calendar-month grid of daily net P&L -- deliberately a real calendar
 * (Monday-first weeks, days outside the month dimmed) rather than a GitHub-
 * style contribution strip, since "calendario diario" is the literal
 * requirement and a month grid is what every trading journal means by that.
 * Server-rendered: month navigation goes through plain links that replace
 * the `month` search param, so it composes with the rest of the filter bar
 * (also URL-driven) without any client state of its own.
 */
export function CalendarHeatmap({
  month,
  daily,
  buildMonthHref,
}: {
  /** "YYYY-MM", already in the account's configured timezone. */
  month: string;
  daily: DailyPnl[];
  buildMonthHref: (month: string) => string;
}) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const monthStart = DateTime.fromISO(`${month}-01`);
  const monthEnd = monthStart.endOf("month");
  const gridStart = monthStart.startOf("week");
  const gridEnd = monthEnd.endOf("week");

  const days: DateTime[] = [];
  for (let day = gridStart; day <= gridEnd; day = day.plus({ days: 1 })) {
    days.push(day);
  }

  const monthPnl = daily
    .filter((d) => d.date.startsWith(month))
    .reduce((sum, d) => sum + Number(d.netPnl), 0);

  const prevMonth = monthStart.minus({ months: 1 }).toFormat("yyyy-LL");
  const nextMonth = monthStart.plus({ months: 1 }).toFormat("yyyy-LL");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href={buildMonthHref(prevMonth)}
            scroll={false}
            className="flex size-6 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
            aria-label="Mes anterior"
          >
            ←
          </Link>
          <span className="min-w-32 text-center text-sm font-medium capitalize">
            {monthStart.setLocale("es").toFormat("LLLL yyyy")}
          </span>
          <Link
            href={buildMonthHref(nextMonth)}
            scroll={false}
            className="flex size-6 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
            aria-label="Mes siguiente"
          >
            →
          </Link>
        </div>
        <span className={cn("text-sm font-medium tabular-nums", pnlColorClass(monthPnl))}>
          {formatSignedMoney(monthPnl)}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] text-muted-foreground">
        {WEEKDAY_LABELS_ES.map((w, i) => (
          // Luxon weeks are Monday-first; index doubles as a stable key here.
          <div key={i}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.map((day) => {
          const iso = day.toFormat("yyyy-LL-dd");
          const entry = byDate.get(iso);
          const inMonth = day.month === monthStart.month;
          const pnl = entry ? Number(entry.netPnl) : null;

          return (
            <div
              key={iso}
              className={cn(
                "flex aspect-square flex-col justify-between overflow-hidden rounded-md border px-1 py-1 text-[10px] sm:px-1.5 sm:text-[11px]",
                !inMonth && "border-transparent opacity-25",
                inMonth && pnl === null && "border-border/60",
                inMonth && pnl !== null && pnl > 0 && "border-positive/30 bg-positive/10",
                inMonth && pnl !== null && pnl < 0 && "border-negative/30 bg-negative/10",
                inMonth && pnl === 0 && "border-border bg-muted/40",
              )}
            >
              <span className="text-muted-foreground">{day.day}</span>
              {entry ? (
                <>
                  <span className={cn("truncate font-medium tabular-nums", pnlColorClass(pnl))}>
                    {formatSignedMoney(pnl, { compact: true })}
                  </span>
                  {/* Cells run ~43px square on a narrow phone -- three lines
                      of text there risks visual overlap, so the trade-count
                      line (the least essential of the three) only shows once
                      cells have more room. */}
                  <span className="hidden text-muted-foreground sm:block">{entry.tradesCount} op.</span>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
