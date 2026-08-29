"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";

import { ScrollableTable } from "@/components/shared/scrollable-table";
import { checkLatestBackup, type BackupCheckResult } from "@/app/(dashboard)/settings/backup-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Abrir la última copia y comprobar que serviría.
 *
 * Las copias automáticas llevaban tiempo corriendo y nadie había abierto una
 * nunca. Una copia que no se ha restaurado jamás no es una copia: es un rumor.
 *
 * El botón no restaura nada -- se puede pulsar cualquier día. Lo que enseña son
 * las dos cosas que hacen falta saber antes del desastre: si el fichero está
 * entero, y cuánto se perdería restaurándolo hoy.
 */
export function BackupCheck() {
  const [result, setResult] = useState<BackupCheckResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comprobar la copia</CardTitle>
        <CardDescription>
          Abre la última copia automática y mira si se podría restaurar de verdad: que el fichero
          esté entero, que no le falte ninguna tabla, y cuánto se perdería si la restauraras hoy. No
          toca nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setResult(await checkLatestBackup());
              })
            }
          >
            <ShieldCheck className="size-4" aria-hidden />
            {isPending ? "Comprobando…" : "Comprobar la última copia"}
          </Button>
        </div>

        {result ? <CheckResult result={result} /> : null}
      </CardContent>
    </Card>
  );
}

function CheckResult({ result }: { result: BackupCheckResult }) {
  if (result.error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-negative/40 bg-negative/5 p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
        <p className="text-sm">{result.error}</p>
      </div>
    );
  }

  const { report, drift } = result;
  if (!report) return null;

  const conFilas = report.tables.filter((t) => t.rows > 0);

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`flex items-start gap-2 rounded-md border p-3 ${
          report.ok ? "border-positive/40 bg-positive/5" : "border-negative/40 bg-negative/5"
        }`}
      >
        {report.ok ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
        )}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{report.summary}</p>
          {result.path ? (
            <p className="text-xs text-muted-foreground">
              Copia comprobada: {result.path.split("/").pop()}
            </p>
          ) : null}
        </div>
      </div>

      {report.problems.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-negative">
          {report.problems.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
      ) : null}

      {report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {report.warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      ) : null}

      {drift ? (
        <p className={`text-sm ${drift.stale ? "text-warning" : "text-muted-foreground"}`}>
          {drift.message}
        </p>
      ) : null}

      {conFilas.length > 0 ? (
        <ScrollableTable>
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Tabla</th>
                <th className="py-1.5 pr-3 text-right font-medium">En la copia</th>
                <th className="py-1.5 text-right font-medium">Ahora mismo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conFilas.map((t) => {
                const fila = drift?.rows.find((r) => r.table === t.table);
                return (
                  <tr key={t.table}>
                    <td className="py-1.5 pr-3 font-mono text-xs">{t.table}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{t.rows}</td>
                    <td
                      className={`py-1.5 text-right tabular-nums ${
                        fila && fila.missing > 0 ? "text-warning" : ""
                      }`}
                    >
                      {fila?.inDatabase ?? "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTable>
      ) : null}
    </div>
  );
}
