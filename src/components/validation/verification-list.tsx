"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { clearVerification, recordVerification } from "@/app/(dashboard)/validation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatMoney, formatNumber, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface VerifiableTrade {
  id: string;
  productId: string;
  direction: "LONG" | "SHORT";
  openedAt: string;
  closedAt: string | null;
  maxSize: string;
  entryWap: string | null;
  exitWap: string | null;
  totalCommissions: string | null;
  netPnl: string | null;
  fillCount: number;
  verification: { matches: boolean; note: string | null } | null;
}

/**
 * One trade at a time, showing exactly the fields
 * docs/VALIDATION_CHECKLIST.md asks you to compare against Coinbase, so
 * the check is a side-by-side read rather than a hunt through the app.
 */
export function VerificationList({ trades, timezone }: { trades: VerifiableTrade[]; timezone: string }) {
  return (
    <div className="flex flex-col gap-3">
      {trades.map((trade) => (
        <TradeVerificationCard key={trade.id} trade={trade} timezone={timezone} />
      ))}
    </div>
  );
}

function TradeVerificationCard({ trade, timezone }: { trade: VerifiableTrade; timezone: string }) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState(trade.verification?.note ?? "");
  const [showNote, setShowNote] = useState(false);

  function submit(matches: boolean) {
    startTransition(async () => {
      const result = await recordVerification(trade.id, matches, note);
      if (result.error) toast.error(result.error);
      else toast.success(matches ? "Marcada como correcta." : "Diferencia registrada.");
      setShowNote(false);
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await clearVerification(trade.id);
      if (result.error) toast.error(result.error);
      else toast.success("Revisión borrada.");
    });
  }

  const verified = trade.verification;

  return (
    <Card className={cn(verified?.matches === false && "border-negative/50")}>
      <CardContent className="flex flex-col gap-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{trade.direction === "LONG" ? "Long" : "Short"}</Badge>
            <span className="font-medium">{trade.productId}</span>
            <span className="text-muted-foreground">{formatDateTime(trade.openedAt, timezone)}</span>
          </div>
          {verified ? (
            <Badge variant={verified.matches ? "positive" : "negative"}>
              {verified.matches ? "Coincide" : "Diferencia"}
            </Badge>
          ) : (
            <Badge variant="warning">Sin revisar</Badge>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <Field label="Apertura" value={formatDateTime(trade.openedAt, timezone)} />
          <Field label="Cierre" value={formatDateTime(trade.closedAt, timezone)} />
          <Field label="Tamaño máximo" value={formatNumber(trade.maxSize, 4)} />
          <Field label="Precio medio entrada" value={formatMoney(trade.entryWap)} />
          <Field label="Precio medio salida" value={formatMoney(trade.exitWap)} />
          <Field label="Comisiones" value={formatMoney(trade.totalCommissions)} />
          <Field
            label="P&L neto"
            value={formatSignedMoney(trade.netPnl)}
            className={pnlColorClass(trade.netPnl)}
          />
          <Field label="Fills" value={String(trade.fillCount)} />
        </dl>

        {verified?.note ? (
          <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            {verified.note}
          </p>
        ) : null}

        {showNote ? (
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="¿Qué no coincide? (ej. el P&L de Coinbase es -12.40)"
            autoFocus
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {verified ? (
            <Button variant="ghost" size="sm" disabled={isPending} onClick={reset}>
              <RotateCcw className="size-4" aria-hidden />
              Revisar de nuevo
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={isPending} onClick={() => submit(true)}>
                <Check className="size-4 text-positive" aria-hidden />
                Coincide con Coinbase
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => (showNote ? submit(false) : setShowNote(true))}
              >
                <X className="size-4 text-negative" aria-hidden />
                {showNote ? "Guardar diferencia" : "No coincide"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", className)}>{value}</dd>
    </div>
  );
}
