"use client";

import { useEffect, useState } from "react";

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

const CAPITAL_STORAGE_KEY = "risk.liveCapital";
const RESERVE_STORAGE_KEY = "risk.liveReserveCash";

/**
 * Coinbase's read-only API this app syncs from has no account-equity/balance
 * endpoint, so "capital" can't be read automatically -- it's a page-local
 * input, same limitation the uploaded reference calculator had. What IS
 * done here: the last value typed is remembered in this browser
 * (localStorage, never sent to our server or Coinbase) so returning to this
 * page doesn't mean retyping it -- restored in an effect (not the initial
 * state) since localStorage doesn't exist during server-side rendering and
 * reading it there would cause a hydration mismatch. Shared across every
 * open-position card below since capital is account-wide, not per-position.
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

  useEffect(() => {
    // Sanctioned exception to the "no setState in an effect" rule: this
    // hydrates state from a client-only source (localStorage isn't
    // available during SSR) exactly once on mount, which is the standard
    // pattern for that -- not the derived-state anti-pattern the rule
    // otherwise guards against.
    const storedCapital = localStorage.getItem(CAPITAL_STORAGE_KEY);
    const storedReserve = localStorage.getItem(RESERVE_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedCapital) setCapital(storedCapital);
    if (storedReserve) setReserveCash(storedReserve);
  }, []);

  function handleCapitalChange(value: string) {
    setCapital(value);
    localStorage.setItem(CAPITAL_STORAGE_KEY, value);
  }

  function handleReserveChange(value: string) {
    setReserveCash(value);
    localStorage.setItem(RESERVE_STORAGE_KEY, value);
  }

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
            Coinbase no expone el balance total de la cuenta por la API de solo lectura que usa esta app, así que
            este valor no puede leerse automáticamente de tu cuenta real -- pero sí se recuerda en este navegador
            (no se guarda en Coinbase ni en nuestra base de datos) para que no tengas que escribirlo cada vez.
            Actualízalo cuando tu capital real cambie.
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
              onChange={(e) => handleCapitalChange(e.target.value)}
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
              onChange={(e) => handleReserveChange(e.target.value)}
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
