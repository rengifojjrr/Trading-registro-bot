"use client";

import { useEffect, useState } from "react";

import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 * input, same limitation the uploaded reference calculator had. The last
 * value typed is remembered in this browser (localStorage, never sent to
 * our server or Coinbase) -- restored in an effect rather than in the
 * initial state, since localStorage doesn't exist during SSR.
 *
 * "Reserve" is deliberately tucked behind an advanced fold: most of the
 * time it's 0, and showing it as a co-equal second field made the very
 * first thing on the page look like a two-part form when it's really one
 * number.
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
    // available during SSR) exactly once on mount.
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
          <CardTitle>Posiciones abiertas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No tienes posiciones abiertas sincronizadas desde Coinbase ahora mismo.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="live-capital" className="flex items-center gap-1.5">
              ¿Cuánto capital tienes en la cuenta?
              <InfoHint label="Capital de la cuenta">
                Coinbase no permite leer tu balance por la API de solo lectura que usa esta app, así que este
                número lo pones tú. Se guarda solo en este navegador -- ni en Coinbase ni en nuestra base de
                datos -- para no tener que escribirlo cada vez.
              </InfoHint>
            </Label>
            <Input
              id="live-capital"
              type="number"
              min={0}
              step="any"
              placeholder="Ej. 13000"
              value={capital}
              onChange={(e) => handleCapitalChange(e.target.value)}
            />
          </div>

          <CollapsibleSection title="Opciones avanzadas">
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="live-reserve" className="flex items-center gap-1.5">
                Reserva que no quieres arriesgar (USD)
                <InfoHint label="Reserva">
                  Parte del capital que quieres dejar fuera del cálculo, como un colchón intocable. Si no
                  apartas nada, déjalo en 0.
                </InfoHint>
              </Label>
              <Input
                id="live-reserve"
                type="number"
                min={0}
                step="any"
                value={reserveCash}
                onChange={(e) => handleReserveChange(e.target.value)}
              />
            </div>
          </CollapsibleSection>

          {positions.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              Tienes {positions.length} posiciones abiertas. Cada una se calcula como si tuviera todo el capital
              disponible para ella sola -- no están netadas entre sí.
            </p>
          ) : null}
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
