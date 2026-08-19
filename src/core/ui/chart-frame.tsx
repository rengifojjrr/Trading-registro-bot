import type { ReactNode } from "react";

import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * El marco común de toda gráfica de Vida.
 *
 * Existe para que ninguna gráfica se quede sin las dos cosas que la hacen
 * útil: un título que sea la pregunta que responde, y un estado vacío que
 * diga qué falta para poder dibujarla. Una gráfica sin datos que se
 * renderiza como un rectángulo con ejes es peor que no enseñar nada --
 * parece rota.
 */
export function ChartFrame({
  title,
  question,
  hint,
  empty,
  emptyLabel = "Todavía no hay datos suficientes.",
  children,
}: {
  title: string;
  /** Una línea explicando qué se ve. Va debajo del título. */
  question?: string;
  /** Detalle metodológico, sólo si hace falta explicar cómo se calcula. */
  hint?: ReactNode;
  empty: boolean;
  emptyLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          {title}
          {hint ? <InfoHint label={title}>{hint}</InfoHint> : null}
        </CardTitle>
        {question ? <CardDescription>{question}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
