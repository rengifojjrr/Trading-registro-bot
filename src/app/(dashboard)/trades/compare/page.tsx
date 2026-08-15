import { GitCompare } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { compareTrades, type ComparisonRow } from "@/lib/analytics/compare";
import { TABLE_COLUMNS_FOR_COMPARE, type TradeTableRow } from "@/lib/analytics/queries";
import { requireUser } from "@/lib/auth/require-user";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Two trades side by side, row by row.
 *
 * The point is not the numbers -- they are already on each trade's own
 * page -- but the difference between them. Which one paid more in
 * commissions, which one was held longer, which one actually made money.
 * That question is very hard to answer by opening two tabs and is trivial
 * here.
 */
export default async function CompareTradesPage(props: PageProps<"/trades/compare">) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const a = typeof searchParams.a === "string" ? searchParams.a : null;
  const b = typeof searchParams.b === "string" ? searchParams.b : null;

  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const timezone = settings?.timezone || "UTC";

  if (!a || !b || a === b) {
    return (
      <>
        <Header />
        <EmptyState
          icon={GitCompare}
          title="Elige dos operaciones distintas"
          description="Desde la lista de operaciones, marca dos con las casillas y pulsa «Comparar»."
        />
      </>
    );
  }

  const { data: rows } = await supabase
    .from("trades")
    .select(TABLE_COLUMNS_FOR_COMPARE)
    .eq("user_id", user.id)
    .in("id", [a, b]);

  const found = (rows ?? []) as unknown as TradeTableRow[];
  const tradeA = found.find((t) => t.id === a);
  const tradeB = found.find((t) => t.id === b);

  if (!tradeA || !tradeB) {
    return (
      <>
        <Header />
        <EmptyState
          icon={GitCompare}
          title="No se encontraron las dos operaciones"
          description="Puede que una se haya recalculado o borrado. Vuelve a la lista y elígelas de nuevo."
        />
      </>
    );
  }

  const comparison = compareTrades(tradeA, tradeB);

  return (
    <>
      <Header />
      <Card>
        <CardContent className="overflow-x-auto pt-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Medida</th>
                <th className="px-3 py-2 text-right font-medium">
                  <TradeLink trade={tradeA} label="A" timezone={timezone} />
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  <TradeLink trade={tradeB} label="B" timezone={timezone} />
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.key} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{row.label}</td>
                  <Cell row={row} side="A" />
                  <Cell row={row} side="B" />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            Se resalta la mejor de las dos sólo donde «mejor» significa algo: pagar menos comisiones es
            mejor, y durar más o menos no lo es en sí mismo.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function Header() {
  return (
    <PageHeader
      title="Comparar operaciones"
      description="Dos operaciones lado a lado, para ver en qué se diferencian de verdad."
    />
  );
}

function TradeLink({
  trade,
  label,
  timezone,
}: {
  trade: TradeTableRow;
  label: string;
  timezone: string;
}) {
  return (
    <Link href={`/trades/${trade.id}`} className="flex flex-col items-end gap-0.5 hover:underline">
      <span className="flex items-center gap-1.5">
        <Badge variant="outline">{label}</Badge>
        <span className="text-foreground">{trade.product_id}</span>
      </span>
      <span className="font-normal">{formatDateTime(trade.opened_at, timezone)}</span>
    </Link>
  );
}

function renderValue(row: ComparisonRow, side: "A" | "B"): string {
  const value = side === "A" ? row.a : row.b;
  switch (row.format) {
    case "money":
      return formatMoney(value);
    case "signed-money":
      return formatSignedMoney(value);
    case "percent":
      return formatPercent(value);
    case "number":
      return formatNumber(value);
    case "duration":
      return formatDuration(value === null ? null : Number(value));
    default:
      return value ?? "--";
  }
}

function Cell({ row, side }: { row: ComparisonRow; side: "A" | "B" }) {
  const wins = row.better === side;
  return (
    <td
      className={cn(
        "px-3 py-2 text-right tabular-nums",
        wins ? "font-semibold text-positive" : undefined,
      )}
    >
      {renderValue(row, side)}
    </td>
  );
}
