import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BuyAndHoldComparison, BuyAndHoldInputs } from "@/lib/analytics/behaviour";
import { formatDate, formatMoney, formatSignedMoney } from "@/lib/format";

/**
 * Trading result against simply holding the same position over the same
 * window.
 *
 * The one figure in the app that questions the activity itself rather than
 * measuring it. Deliberately not dressed up: when holding would have paid
 * better, the card says so plainly instead of softening it.
 */
export function BuyAndHoldCard({
  inputs,
  comparison,
  timezone,
}: {
  inputs: BuyAndHoldInputs;
  comparison: BuyAndHoldComparison | null;
  timezone: string;
}) {
  const hint = (
    <InfoHint label="Comparación contra mantener">
      Se toma el precio de entrada de tu primera operación del período y el precio de salida de la última,
      con el tamaño medio de tus posiciones. La pregunta que responde es: si en lugar de operar hubieras
      comprado al principio y no hubieras tocado nada hasta el final, ¿cómo habría salido? No incluye
      comisiones del lado de mantener, porque no habría habido ninguna.
    </InfoHint>
  );

  // An unavailable comparison is a normal state, not a failure: it means the
  // period has nothing honest to compare against.
  if (!inputs.available || !comparison) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            ¿Valió la pena operar?
            {hint}
          </CardTitle>
          <CardDescription>
            {inputs.available ? "Todavía no se puede calcular." : inputs.reason}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={comparison.beatsBuyAndHold ? undefined : "border-warning/40"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          ¿Valió la pena operar?
          {hint}
        </CardTitle>
        <CardDescription>{comparison.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-6">
          <Figure label="Operando" value={formatSignedMoney(comparison.tradingNetPnl)} emphasis />
          <Figure label="Manteniendo" value={formatSignedMoney(comparison.buyAndHoldPnl)} emphasis />
          <Figure label="Diferencia" value={formatSignedMoney(comparison.difference)} emphasis />
        </div>
        <p className="text-xs text-muted-foreground">
          {inputs.productId} · {formatDate(inputs.from, timezone)} a {formatDate(inputs.to, timezone)} ·
          de {formatMoney(inputs.startPrice)} a {formatMoney(inputs.endPrice)} · tamaño medio{" "}
          <span className="tabular-nums">{inputs.size}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={emphasis ? "text-lg font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}
