import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlaybookAdherence } from "@/lib/journal/rules";
import { formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";

/**
 * Si cumplir tu guion coincide con operar mejor.
 *
 * El guion se marcaba desde la ficha de cada operación y no se leía en ningún
 * sitio: la lista era una ceremonia. Un punto que no cambia nada no es neutro
 * -- enseña a marcar sin leer, y con él pierden crédito los que sí importan.
 */
export function PlaybookAdherenceCard({ adherence }: { adherence: PlaybookAdherence }) {
  const conMuestra = adherence.items.filter((i) => i.reviewed > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu guion, comprobado</CardTitle>
        <CardDescription>{adherence.verdict}</CardDescription>
      </CardHeader>

      {conMuestra.length > 0 ? (
        <CardContent className="flex flex-col gap-4">
          {adherence.overallPct !== null ? (
            <p className="text-sm text-muted-foreground">
              Cumples{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatPercent(adherence.overallPct)}
              </span>{" "}
              de lo que marcas, en {adherence.reviewedTrades} operación
              {adherence.reviewedTrades === 1 ? "" : "es"} cerrada
              {adherence.reviewedTrades === 1 ? "" : "s"}.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Punto del guion</th>
                  <th className="py-2 pr-3 text-right font-medium">Lo cumples</th>
                  <th className="py-2 pr-3 text-right font-medium">Cumpliéndolo</th>
                  <th className="py-2 pr-3 text-right font-medium">Sin cumplirlo</th>
                  <th className="py-2 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conMuestra.map((item) => (
                  <tr key={item.itemId}>
                    <td className="py-2 pr-3">{item.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {item.adherencePct === null ? "--" : formatPercent(item.adherencePct)}
                      <span className="ml-1 text-xs text-muted-foreground">({item.reviewed})</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {item.medianWhenMet === null ? "--" : formatSignedMoney(item.medianWhenMet)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {item.medianWhenMissed === null
                        ? "--"
                        : formatSignedMoney(item.medianWhenMissed)}
                    </td>
                    <td
                      className={`py-2 text-right font-medium tabular-nums ${
                        item.difference === null
                          ? ""
                          : pnlTone(item.difference) === "positive"
                            ? "text-positive"
                            : pnlTone(item.difference) === "negative"
                              ? "text-negative"
                              : ""
                      }`}
                    >
                      {item.difference === null ? "--" : formatSignedMoney(item.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Las dos columnas del medio son el resultado de la operación mediana, no la media: una
            sola operación grande no debería decidir si un punto del guion sirve. Los guiones sin
            «--» son los que ya tienen operaciones suficientes de los dos lados.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
