"use client";

import { TrendingDown, TrendingUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PracticePosition, PracticeSummary, PracticeTrade } from "@/lib/backtest/practice";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Operar sobre la reproducción, a ciegas.
 *
 * La reproducción ya escondía el desenlace; esto añade lo que faltaba: poder
 * comprar, poner stop y cerrar mientras las velas van saliendo. Al terminar
 * dice qué tal lo hiciste **y qué habría dado no hacer nada**, que es la única
 * referencia que hace que el resultado signifique algo: si el precio subió un
 * 20% en el tramo y ganaste un 3% operando, lo hiciste peor que estarte
 * quieto.
 */
export function PracticePanel({
  position,
  trades,
  summary,
  lastPrice,
  onOpen,
  onClose,
  onSetLevel,
  onReset,
}: {
  position: PracticePosition | null;
  trades: PracticeTrade[];
  summary: PracticeSummary;
  lastPrice: number;
  onOpen: (direction: "LONG" | "SHORT") => void;
  onClose: () => void;
  onSetLevel: (which: "stop" | "target", value: number | null) => void;
  onReset: () => void;
}) {
  const flotante = position
    ? (position.direction === "LONG" ? lastPrice - position.entryPrice : position.entryPrice - lastPrice) *
      position.size
    : 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Practicar</h3>
        {trades.length > 0 ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
            Empezar de nuevo
          </Button>
        ) : null}
      </div>

      {position ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                position.direction === "LONG"
                  ? "bg-positive/15 text-positive"
                  : "bg-negative/15 text-negative",
              )}
            >
              {position.direction === "LONG" ? "Largo" : "Corto"} × {position.size}
            </span>
            <span className="text-muted-foreground">desde</span>
            <span className="tabular-nums">{formatMoney(position.entryPrice)}</span>
            <span
              className={cn(
                "ml-auto tabular-nums font-medium",
                flotante >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {flotante >= 0 ? "+" : ""}
              {formatMoney(flotante)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <LevelInput
              label="Stop"
              value={position.stop}
              onChange={(v) => onSetLevel("stop", v)}
            />
            <LevelInput
              label="Objetivo"
              value={position.target}
              onChange={(v) => onSetLevel("target", v)}
            />
          </div>

          <Button variant="outline" size="sm" className="gap-1.5" onClick={onClose}>
            <X className="size-3.5" aria-hidden />
            Cerrar a {formatMoney(lastPrice)}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 text-positive"
            onClick={() => onOpen("LONG")}
          >
            <TrendingUp className="size-4" aria-hidden />
            Comprar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 text-negative"
            onClick={() => onOpen("SHORT")}
          >
            <TrendingDown className="size-4" aria-hidden />
            Vender
          </Button>
        </div>
      )}

      {trades.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-2.5 text-xs">
          <Row label="Operaciones" value={String(summary.operaciones)} />
          <Row
            label="Aciertos"
            value={`${summary.aciertos.toFixed(0)}% (${summary.ganadoras}/${summary.operaciones})`}
          />
          <Row
            label="Tu resultado"
            value={formatMoney(Number(summary.neto))}
            tone={Number(summary.neto) >= 0 ? "positive" : "negative"}
          />
          <Row
            label="Sin hacer nada"
            value={formatMoney(Number(summary.comprarYAguantar))}
            tone={Number(summary.comprarYAguantar) >= 0 ? "positive" : "negative"}
          />
        </dl>
      ) : (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Compra o vende mientras avanzan las velas. Al final se compara tu resultado con lo que
          habría dado no hacer nada: es la única forma de saber si operar aportó algo.
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Un nivel que se puede dejar sin poner.
 *
 * Vacío es «sin stop», que no es lo mismo que un stop en cero -- ése estaría
 * pegado a la entrada y saltaría de inmediato.
 */
function LevelInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        step="any"
        value={value ?? ""}
        placeholder="sin poner"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="h-7 text-xs"
      />
    </label>
  );
}
