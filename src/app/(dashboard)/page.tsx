import { LayoutDashboard } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

const STAT_LABELS = [
  "P&L neto acumulado",
  "Resultado del día",
  "Win rate",
  "Profit factor",
  "Drawdown máximo",
  "Operaciones",
] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { count: tradeCount } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const hasTrades = Boolean(tradeCount);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Capital, rendimiento y estadísticas de tus operaciones de futuros de Bitcoin."
      />

      {!hasTrades ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Todavía no hay operaciones que analizar"
          description="Conecta Coinbase Advanced o importa un histórico en CSV para que el motor de reconstrucción genere tus primeras operaciones. Las métricas de este panel (P&L, win rate, profit factor, curva de capital, calendario diario, rendimiento por sesión) se calculan a partir de operaciones reales -- no se muestran cifras de ejemplo aquí."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {STAT_LABELS.map((label) => (
            <Card key={label}>
              <CardHeader className="pb-0">
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-lg font-semibold tabular-nums text-muted-foreground">
                --
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
