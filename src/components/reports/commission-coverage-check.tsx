"use client";

import { useState } from "react";

import { InfoHint } from "@/components/shared/info-hint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateCommissionCoverage } from "@/lib/analytics/commission-coverage";
import { formatMoney, formatSignedMoney } from "@/lib/format";

/**
 * Checks the month's recorded commissions against the broker statement.
 *
 * Commissions are the quietest way for a P&L to be wrong: a missing fill
 * shows up as a missing trade and gets noticed, while a commission that was
 * never recorded just makes every month read slightly better than it was.
 *
 * The statement total is something only the user has, so this is a
 * comparison rather than a fetch, and nothing is stored -- it answers a
 * question you're asking right now.
 */
export function CommissionCoverageCheck({ recorded }: { recorded: string }) {
  const [statement, setStatement] = useState("");

  const parsed = statement.trim() === "" ? null : Number(statement);
  const result =
    parsed !== null && Number.isFinite(parsed)
      ? evaluateCommissionCoverage({ recorded, statement: parsed })
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Cuadrar comisiones
          <InfoHint label="Cuadrar comisiones">
            Escribe el total de comisiones que aparece en tu estado de cuenta de Coinbase para este mes.
            Si no cuadra con lo registrado, tu P&amp;L neto está mal por exactamente esa diferencia. No se
            guarda nada: es una comprobación del momento.
          </InfoHint>
        </CardTitle>
        <CardDescription>
          Registrado este mes: <span className="tabular-nums">{formatMoney(recorded)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="statement_total">Total según tu estado de cuenta (USD)</Label>
          <Input
            id="statement_total"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            inputMode="decimal"
            placeholder="p. ej. 128.40"
          />
        </div>

        {result ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.status === "MATCH" ? "positive" : "negative"}>
                {result.status === "MATCH"
                  ? "Cuadra"
                  : result.status === "UNDER_RECORDED"
                    ? "Faltan comisiones"
                    : "Sobran comisiones"}
              </Badge>
              {result.status !== "MATCH" ? (
                <span className="text-sm tabular-nums text-muted-foreground">
                  Diferencia: {formatSignedMoney(result.difference)}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{result.message}</p>
            {result.status !== "MATCH" ? (
              <p className="text-sm">
                Tu P&amp;L neto de este mes está desviado en{" "}
                <span className="font-medium tabular-nums">
                  {formatSignedMoney(result.impactOnNetPnl)}
                </span>
                .
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
