import { lookupPair, type CorrelationMatrix } from "@/lib/bots/correlation";
import { MIN_DAYS_FOR_CORRELATION, REDUNDANT_CORRELATION } from "@/lib/bots/types";
import { cn } from "@/lib/utils";

/**
 * La matriz de correlaciones entre bots.
 *
 * Cada celda es el Pearson del P&L diario de dos bots. Por encima de 0,5 se
 * pinta en aviso: dos bots que ganan y pierden los mismos días son uno con el
 * doble de tamaño. Con menos de veinte días en común la celda dice cuántos
 * hay, no un número que sería una anécdota.
 */
export function CorrelationGrid({
  matrix,
  names,
}: {
  matrix: CorrelationMatrix;
  names: Record<string, string>;
}) {
  if (matrix.ids.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Hacen falta al menos dos bots con operaciones para comparar cómo se mueven.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="p-1" />
              {matrix.ids.map((id) => (
                <th key={id} className="max-w-24 truncate p-1 text-xs font-medium text-muted-foreground" title={names[id] ?? id}>
                  {names[id] ?? id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.ids.map((fila) => (
              <tr key={fila}>
                <th className="max-w-32 truncate p-1 text-left text-xs font-medium text-muted-foreground" title={names[fila] ?? fila}>
                  {names[fila] ?? fila}
                </th>
                {matrix.ids.map((col) => {
                  if (fila === col) {
                    return (
                      <td key={col} className="p-1">
                        <div className="flex h-9 w-14 items-center justify-center rounded bg-secondary/60 text-xs text-muted-foreground">
                          --
                        </div>
                      </td>
                    );
                  }
                  const par = lookupPair(matrix, fila, col);
                  const rho = par?.rho ?? null;
                  return (
                    <td key={col} className="p-1">
                      <div
                        className={cn(
                          "flex h-9 w-14 items-center justify-center rounded text-xs tabular-nums",
                          rho === null
                            ? "bg-secondary/40 text-muted-foreground"
                            : rho > REDUNDANT_CORRELATION
                              ? "bg-warning/20 font-semibold text-warning"
                              : rho < -0.3
                                ? "bg-positive/15 text-positive"
                                : "bg-secondary text-foreground",
                        )}
                        title={
                          rho === null
                            ? `${par?.days ?? 0} días en común; hacen falta ${MIN_DAYS_FOR_CORRELATION}.`
                            : `${par?.days} días en común.`
                        }
                      >
                        {rho === null ? `${par?.days ?? 0}d` : rho.toFixed(2)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {matrix.mean === null
          ? `Sin pares con ${MIN_DAYS_FOR_CORRELATION} días en común todavía.`
          : `Correlación media ${matrix.mean.toFixed(2)}. `}
        {matrix.redundant.length > 0
          ? `${matrix.redundant.length} par${matrix.redundant.length === 1 ? "" : "es"} por encima de ${REDUNDANT_CORRELATION}: medio gemelos.`
          : matrix.mean !== null
            ? "Ningún par por encima de 0,5: el portfolio está de verdad repartido."
            : ""}
      </p>
    </div>
  );
}
