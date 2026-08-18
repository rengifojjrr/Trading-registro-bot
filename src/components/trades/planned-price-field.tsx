"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { resolvePlannedPrice, type PriceUnit } from "@/lib/journal/options";

/**
 * A stop or target typed either as a price or as a percentage of entry.
 *
 * Most people size a stop in percent ("I'll risk 1%") but every other part
 * of this app compares against prices, so the percentage is converted here
 * and the price is what gets submitted. The resulting price is shown while
 * you type -- a percentage you cannot check against a number is a
 * percentage you will get wrong.
 *
 * Percent mode is hidden when the trade has no entry price, since there
 * would be nothing to take a percentage of.
 */
export function PlannedPriceField({
  id,
  name,
  defaultValue,
  entryPrice,
  direction,
  kind,
}: {
  id: string;
  name: string;
  defaultValue: string | number | null;
  entryPrice: string | null;
  direction: "LONG" | "SHORT";
  kind: "STOP" | "TARGET";
}) {
  const [unit, setUnit] = useState<PriceUnit>("PRICE");
  const [raw, setRaw] = useState(defaultValue === null ? "" : String(defaultValue));

  const resolved =
    unit === "PERCENT" ? resolvePlannedPrice({ raw, unit, entryPrice, direction, kind }) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          step="any"
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={unit === "PERCENT" ? "p. ej. 1.5" : "precio"}
          className="flex-1"
        />
        {entryPrice ? (
          <Select value={unit} onValueChange={(v) => setUnit(v as PriceUnit)}>
            <SelectTrigger className="w-24" aria-label="Unidad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRICE">Precio</SelectItem>
              <SelectItem value="PERCENT">%</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {/* What actually reaches the server is always a price, whichever way
          it was typed -- the rest of the app has no notion of a percentage
          stop. */}
      <input
        type="hidden"
        name={name}
        value={unit === "PERCENT" ? (resolved ?? "") : raw}
      />

      {unit === "PERCENT" && resolved ? (
        <p className="text-xs text-muted-foreground">
          Se guardará como {formatMoney(resolved)}
        </p>
      ) : null}
    </div>
  );
}
