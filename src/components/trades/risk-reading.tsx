"use client";

import { useState } from "react";

import {
  formatPercentOfCapital,
  formatRMultiple,
  readRisk,
  riskFromStop,
} from "@/lib/risk/risk-amount";
import { cn } from "@/lib/utils";

/**
 * Lo que significa el riesgo que acabas de teclear.
 *
 * El campo pedía un importe en la moneda de la cuenta y no hacía nada con él:
 * ni salía en ninguna cifra, ni se comparaba con el límite configurado, ni
 * servía para leer el resultado. Un número suelto en dólares no dice si
 * arriesgaste mucho -- cien es prudente con diez mil de capital y temerario
 * con quinientos -- así que aquí se traduce a las dos cosas que sí se pueden
 * comparar entre operaciones: el porcentaje del capital y las erres.
 *
 * Se calcula mientras escribes y no al guardar, porque la pregunta que
 * responde -- «¿esto es demasiado?» -- hay que hacérsela antes de guardar.
 */
export function RiskReading({
  name,
  defaultValue,
  accountSize,
  maxRiskPct,
  netPnl,
  stopLossPrice,
  direction,
  entryWap,
  size,
  contractSize,
}: {
  /** El campo del formulario cuyo valor se lee. */
  name: string;
  defaultValue: string | null;
  accountSize: number | null;
  maxRiskPct: number | null;
  /** El resultado neto, si la operación ya cerró. */
  netPnl: number | null;
  /**
   * Lo que hace falta para deducir el riesgo del stop en vez de teclearlo.
   * El stop llega desde el formulario porque cambia mientras escribes.
   */
  stopLossPrice: number | null;
  direction: "LONG" | "SHORT";
  entryWap: number | null;
  size: number | null;
  contractSize: number | null;
}) {
  const [raw, setRaw] = useState(defaultValue ?? "");

  // Si no lo tecleaste, se deduce de dónde pusiste el stop: la distancia a la
  // entrada por los contratos por el tamaño de contrato. No hay nada que
  // estimar, y era el motivo por el que este campo casi siempre estaba vacío
  // y las erres no salían nunca.
  const deducido = riskFromStop({ direction, entryWap, stopLossPrice, size, contractSize });
  const tecleado = raw === "" ? null : Number(raw);
  const usado = tecleado ?? deducido;

  const reading = readRisk({
    riskAmount: usado,
    accountSize,
    maxRiskPct,
    netPnl,
  });

  const percent = formatPercentOfCapital(reading.percentOfCapital);
  const r = formatRMultiple(reading.rMultiple);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={name}
        name={name}
        type="number"
        step="any"
        autoComplete="off"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      {percent === null && r === null ? (
        <p className="text-xs text-muted-foreground">
          {accountSize === null
            ? "Pon tu capital en Configuración y aquí saldrá qué porcentaje representa."
            : "Cuánto perderías si saltara el stop. Si apuntas el stop más abajo, sale solo."}
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {tecleado === null && deducido !== null ? (
            <span className="text-muted-foreground">deducido del stop ·</span>
          ) : null}
          {percent ? (
            <span className={cn(reading.overLimit ? "font-medium text-negative" : "text-muted-foreground")}>
              {percent}
              {reading.overLimit && maxRiskPct !== null
                ? ` · pasa de tu tope del ${String(maxRiskPct).replace(".", ",")} %`
                : ""}
            </span>
          ) : null}

          {percent && r ? <span className="text-muted-foreground">·</span> : null}

          {r ? (
            <span
              className={cn(
                "font-medium tabular-nums",
                (reading.rMultiple ?? 0) < 0 ? "text-negative" : "text-positive",
              )}
              title="El resultado dividido entre lo que arriesgaste"
            >
              resultado {r}
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}
