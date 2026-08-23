import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Comparison, Split } from "@/lib/analytics/life-correlation";
import { formatSignedMoney, pnlTone } from "@/lib/format";

/**
 * Lo único que esta aplicación puede contarte y una plataforma de trading no.
 *
 * Los módulos de sueño y hábitos llevan meses guardando datos que nadie cruzaba
 * con el trading: cada uno enseñaba su propia gráfica, y la pregunta que los
 * une -- «¿opero peor cuando duermo mal?» -- no la contestaba nadie.
 *
 * La tarjeta enseña las dos medianas una al lado de la otra en vez de un solo
 * número de correlación a propósito: un coeficiente se lee como una sentencia,
 * y dos grupos con su número de días cada uno dejan ver de cuánta muestra sale
 * la comparación.
 */
export function LifeCrossCard({ sleep, habits }: { sleep: Comparison; habits: Comparison }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cómo operas según cómo vives</CardTitle>
        <CardDescription>
          El cruce entre lo que apuntas de tu sueño y tus hábitos y lo que hace la cuenta ese mismo
          día. Es coincidencia observada, no causa demostrada: puede que las dos cosas pasen los días
          que hay noticias.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <ComparisonBlock comparison={sleep} />
        <ComparisonBlock comparison={habits} />
      </CardContent>
    </Card>
  );
}

function ComparisonBlock({ comparison }: { comparison: Comparison }) {
  const { worse, better } = comparison;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{comparison.question}</h3>

      {worse && better ? (
        <div className="grid grid-cols-2 gap-3">
          <SplitTile split={worse} />
          <SplitTile split={better} />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{comparison.verdict}</p>
    </section>
  );
}

const TONE_CLASS = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "",
} as const;

function SplitTile({ split }: { split: Split }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{split.label}</p>
      <p className={`text-lg font-semibold tabular-nums ${TONE_CLASS[pnlTone(split.medianPnl)]}`}>
        {formatSignedMoney(split.medianPnl)}
      </p>
      <p className="text-xs text-muted-foreground">
        día mediano · {split.days} días · {split.winningDays} en verde
      </p>
    </div>
  );
}
