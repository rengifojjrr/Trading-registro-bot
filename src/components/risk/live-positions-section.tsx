"use client";

import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Direction, RiskConstants } from "@/lib/risk/margin";
import type { LiveMarginRates } from "@/lib/risk/product-margin";

import { LiveMarginCard } from "./live-margin-card";

export interface LivePositionData {
  id: string;
  productId: string;
  displayName: string | null;
  direction: Direction;
  entryWap: string;
  /** Contracts still open (totalEntryQty - totalExitQty), NOT BTC. */
  openQty: string;
  contractSize: string;
  entryCommissions: string;
  liveMarginRates: LiveMarginRates | null;
}

/**
 * Coinbase's read-only API this app syncs from has no account-equity/balance
 * endpoint, so "capital" can't be read automatically -- it's a page-local
 * input, never persisted, same limitation the uploaded reference calculator
 * had. Shared across every open-position card below since capital is
 * account-wide, not per-position.
 */
export function LivePositionsSection({
  positions,
  riskConstants,
}: {
  positions: LivePositionData[];
  riskConstants: RiskConstants;
}) {
  const [capital, setCapital] = useState("");
  const [reserveCash, setReserveCash] = useState("0");

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Posiciones abiertas -- en vivo</CardTitle>
          <CardDescription>No tienes posiciones abiertas sincronizadas desde Coinbase ahora mismo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Capital de la cuenta</CardTitle>
          <CardDescription>
            Coinbase no expone el balance total de la cuenta por la API de solo lectura que usa esta app -- este
            valor no se guarda, ingrésalo cada vez que quieras ver tu margen actualizado.
            {positions.length > 1 ? (
              <>
                {" "}
                Tienes {positions.length} posiciones abiertas: cada tarjeta de abajo calcula su margen asumiendo que
                tiene todo el capital disponible para ella sola, sin restar el efecto de las otras -- no están
                netadas entre sí.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:max-w-md sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-capital">Capital total (USD)</Label>
            <Input
              id="live-capital"
              type="number"
              min={0}
              step="any"
              placeholder="0.00"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-reserve">Reserva que no arriesgas (USD)</Label>
            <Input
              id="live-reserve"
              type="number"
              min={0}
              step="any"
              value={reserveCash}
              onChange={(e) => setReserveCash(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {positions.map((position) => (
        <LiveMarginCard
          key={position.id}
          position={position}
          riskConstants={riskConstants}
          capital={capital || "0"}
          reserveCash={reserveCash || "0"}
        />
      ))}
    </div>
  );
}
