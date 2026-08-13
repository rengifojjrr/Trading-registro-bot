"use client";

import { Decimal } from "decimal.js";
import { useMemo, useState } from "react";

import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { InfoHint } from "@/components/shared/info-hint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatNumber } from "@/lib/format";
import { calculateMaxContracts, type Direction, type MarginConstants, type RiskConstants } from "@/lib/risk/margin";
import type { LiveMarginRates } from "@/lib/risk/product-margin";
import { cn } from "@/lib/utils";

export interface CalculatorProduct {
  productId: string;
  displayName: string;
  contractSize: string;
  longMarginRates: LiveMarginRates | null;
  shortMarginRates: LiveMarginRates | null;
}

interface CalculatorState {
  productId: string;
  direction: Direction;
  capital: string;
  entry: string;
  riskPrice: string;
  hours: string;
  mmr: string; // percent, e.g. "10" for 10%
  targetMR: string; // percent
  imDay: string; // percent
  imNight: string; // percent
  funding: string; // percent per hour
  tradeFee: string; // percent
  minFee: string; // USD, not a percent
  reserve: string; // USD
}

const SCENARIO_MMR_PERCENTS = ["5", "7.5", "10", "12.5", "15", "20", "25"];

/** Never throws on empty/partial/invalid user keystrokes -- the boundary where raw <input> text becomes a Decimal. */
function safeDecimal(value: string, fallback = "0"): Decimal {
  if (value.trim() === "") return new Decimal(fallback);
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
}

function pct(value: string): string {
  return safeDecimal(value).dividedBy(100).toString();
}

function buildConstants(params: {
  mmrPercent: string;
  targetMRPercent: string;
  fundingPercent: string;
  tradeFeePercent: string;
  minFee: string;
  contractSize: string;
}): MarginConstants {
  return {
    maintenanceMarginRate: pct(params.mmrPercent),
    targetMarginRatio: pct(params.targetMRPercent),
    fundingRatePerHour: pct(params.fundingPercent),
    tradingFeePct: pct(params.tradeFeePercent),
    minFeePerContract: safeDecimal(params.minFee).toString(),
    contractSize: params.contractSize,
  };
}

function ratesForDirection(product: CalculatorProduct | undefined, direction: Direction): LiveMarginRates | null {
  if (!product) return null;
  return direction === "LONG" ? product.longMarginRates : product.shortMarginRates;
}

function makeInitialState(riskConstants: RiskConstants, product: CalculatorProduct | undefined): CalculatorState {
  const rates = ratesForDirection(product, "LONG");
  return {
    productId: product?.productId ?? "",
    direction: "LONG",
    // Defaults below (other than product/settings-derived fields) mirror the
    // uploaded reference calculator's own example values.
    capital: "13000",
    entry: "63710",
    riskPrice: "50000",
    hours: "168",
    mmr: new Decimal(riskConstants.maintenanceMarginRate).times(100).toString(),
    targetMR: new Decimal(riskConstants.targetMarginRatio).times(100).toString(),
    imDay: rates ? new Decimal(rates.intradayMarginRate).times(100).toString() : "10",
    imNight: rates ? new Decimal(rates.overnightMarginRate).times(100).toString() : "25",
    funding: rates ? new Decimal(rates.fundingRatePerHour).times(100).toString() : "0.001",
    tradeFee: new Decimal(riskConstants.tradingFeePct).times(100).toString(),
    minFee: riskConstants.minFeePerContract,
    reserve: "1000",
  };
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step = "any",
  min,
  max,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string | number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Faithful React port of the uploaded standalone HTML risk calculator
 * (coinbase_btc_perpetual_risk_calculator.html), reusing lib/risk/margin.ts
 * (validated against that tool's own PDF-documented worked example) instead
 * of re-deriving the formula. Enhancements over the original: a direction
 * toggle (the prototype was LONG-only), day/night initial margin and
 * funding prefilled from Coinbase's REAL synced rates for the selected
 * product, and -- the reason for this layout -- only the four inputs a
 * trader actually changes per trade are shown by default. The original's
 * twelve co-equal fields were the single biggest source of "too much
 * going on" here. Purely a client-side what-if scratchpad; nothing is
 * persisted.
 */
export function MarginCalculator({
  riskConstants,
  products,
}: {
  riskConstants: RiskConstants;
  products: CalculatorProduct[];
}) {
  const [state, setState] = useState<CalculatorState>(() => makeInitialState(riskConstants, products[0]));

  function updateField<K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function applyRates(next: Partial<CalculatorState>, rates: LiveMarginRates | null) {
    setState((s) => ({
      ...s,
      ...next,
      ...(rates
        ? {
            imDay: new Decimal(rates.intradayMarginRate).times(100).toString(),
            imNight: new Decimal(rates.overnightMarginRate).times(100).toString(),
            funding: new Decimal(rates.fundingRatePerHour).times(100).toString(),
          }
        : {}),
    }));
  }

  function handleProductChange(productId: string) {
    const product = products.find((p) => p.productId === productId);
    applyRates({ productId }, ratesForDirection(product, state.direction));
  }

  function handleDirectionChange(direction: Direction) {
    const product = products.find((p) => p.productId === state.productId);
    applyRates({ direction }, ratesForDirection(product, direction));
  }

  const contractSize = products.find((p) => p.productId === state.productId)?.contractSize ?? "0.01";

  const sizingParams = useMemo(
    () => ({
      direction: state.direction,
      capital: safeDecimal(state.capital).toString(),
      reserveCash: safeDecimal(state.reserve).toString(),
      entryPrice: safeDecimal(state.entry).toString(),
      riskPrice: safeDecimal(state.riskPrice).toString(),
      hoursOpen: safeDecimal(state.hours).toString(),
    }),
    [state.direction, state.capital, state.reserve, state.entry, state.riskPrice, state.hours],
  );

  const sizing = useMemo(
    () =>
      calculateMaxContracts({
        ...buildConstants({
          mmrPercent: state.mmr,
          targetMRPercent: state.targetMR,
          fundingPercent: state.funding,
          tradeFeePercent: state.tradeFee,
          minFee: state.minFee,
          contractSize,
        }),
        ...sizingParams,
      }),
    [sizingParams, state.mmr, state.targetMR, state.funding, state.tradeFee, state.minFee, contractSize],
  );

  const scenarios = useMemo(
    () =>
      SCENARIO_MMR_PERCENTS.map((mmrPercent) => ({
        mmrPercent,
        result: calculateMaxContracts({
          ...buildConstants({
            mmrPercent,
            targetMRPercent: state.targetMR,
            fundingPercent: state.funding,
            tradeFeePercent: state.tradeFee,
            minFee: state.minFee,
            contractSize,
          }),
          ...sizingParams,
        }),
      })),
    [sizingParams, state.targetMR, state.funding, state.tradeFee, state.minFee, contractSize],
  );

  const usable = Decimal.max(0, safeDecimal(state.capital).minus(safeDecimal(state.reserve)));
  const notional = new Decimal(sizing.notional);
  const dayMargin = notional.times(pct(state.imDay));
  const nightMargin = notional.times(pct(state.imNight));
  const nightOk = nightMargin.lte(usable);
  const riskOk =
    sizing.marginRatioAtRisk === null ? true : new Decimal(sizing.marginRatioAtRisk).lte(pct(state.targetMR));

  let statusLabel: string;
  let statusVariant: "positive" | "negative";
  if (sizing.contracts === 0) {
    statusLabel = "Revisa los parámetros";
    statusVariant = "negative";
  } else if (!nightOk) {
    statusLabel = "No pasa margen overnight";
    statusVariant = "negative";
  } else if (!riskOk) {
    statusLabel = "Excede tu margen objetivo";
    statusVariant = "negative";
  } else {
    statusLabel = "Dentro de tu modelo";
    statusVariant = "positive";
  }

  const fundingSigned = new Decimal(sizing.fundingCost);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.25fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Calculadora de tamaño</CardTitle>
            <CardDescription>
              ¿Cuántos contratos puedo abrir sin pasarme de mi riesgo? Cambia los valores y se recalcula solo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {products.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="calc-product">Producto</Label>
                  <Select value={state.productId} onValueChange={handleProductChange}>
                    <SelectTrigger id="calc-product">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.productId} value={p.productId}>
                          {p.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="calc-direction">Dirección</Label>
                <Select value={state.direction} onValueChange={(v) => handleDirectionChange(v as Direction)}>
                  <SelectTrigger id="calc-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LONG">Long</SelectItem>
                    <SelectItem value="SHORT">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <NumberField
                id="calc-capital"
                label="Capital disponible (USD)"
                value={state.capital}
                min={0}
                onChange={(v) => updateField("capital", v)}
              />
              <NumberField
                id="calc-entry"
                label="Precio de entrada (USD)"
                value={state.entry}
                min={0}
                onChange={(v) => updateField("entry", v)}
              />
              <NumberField
                id="calc-risk-price"
                label={state.direction === "LONG" ? "Precio mínimo a soportar" : "Precio máximo a soportar"}
                value={state.riskPrice}
                min={0}
                hint={
                  state.direction === "LONG"
                    ? "El precio más bajo al que quieres seguir en la operación sin pasarte de tu margen objetivo."
                    : "El precio más alto al que quieres seguir en la operación sin pasarte de tu margen objetivo."
                }
                onChange={(v) => updateField("riskPrice", v)}
              />
              <NumberField
                id="calc-hours"
                label="Horas estimadas abierta"
                value={state.hours}
                min={0}
                hint="Se usa solo para estimar el costo de funding acumulado."
                onChange={(v) => updateField("hours", v)}
              />
            </div>

            <CollapsibleSection
              title="Ajustes avanzados"
              subtitle="Fees, funding y márgenes -- ya vienen con tus valores configurados"
              className="border-t border-border pt-3"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumberField
                  id="calc-mmr"
                  label="Maintenance Margin Rate (%)"
                  value={state.mmr}
                  min={0.01}
                  max={100}
                  step={0.1}
                  hint="Coinbase no lo expone por API: cópialo de tu cuenta. Se toma de tu Configuración."
                  onChange={(v) => updateField("mmr", v)}
                />
                <NumberField
                  id="calc-target-mr"
                  label="Margin Ratio objetivo (%)"
                  value={state.targetMR}
                  min={1}
                  max={99}
                  step={1}
                  hint="El colchón que quieres conservar al precio de riesgo. Más bajo = más conservador."
                  onChange={(v) => updateField("targetMR", v)}
                />
                <NumberField
                  id="calc-im-day"
                  label="Initial Margin intradía (%)"
                  value={state.imDay}
                  min={0}
                  max={100}
                  step={0.1}
                  hint="Valor real sincronizado desde Coinbase para este producto."
                  onChange={(v) => updateField("imDay", v)}
                />
                <NumberField
                  id="calc-im-night"
                  label="Initial Margin overnight (%)"
                  value={state.imNight}
                  min={0}
                  max={100}
                  step={0.1}
                  hint="Valor real sincronizado desde Coinbase. Suele ser bastante más alto que el intradía."
                  onChange={(v) => updateField("imNight", v)}
                />
                <NumberField
                  id="calc-funding"
                  label="Funding por hora (%)"
                  value={state.funding}
                  step={0.0001}
                  onChange={(v) => updateField("funding", v)}
                />
                <NumberField
                  id="calc-trade-fee"
                  label="Trading fee por lado (%)"
                  value={state.tradeFee}
                  min={0}
                  step={0.001}
                  onChange={(v) => updateField("tradeFee", v)}
                />
                <NumberField
                  id="calc-min-fee"
                  label="Fee mínimo por contrato (USD)"
                  value={state.minFee}
                  min={0}
                  step={0.01}
                  onChange={(v) => updateField("minFee", v)}
                />
                <NumberField
                  id="calc-reserve"
                  label="Reserva que no arriesgas (USD)"
                  value={state.reserve}
                  min={0}
                  step={100}
                  onChange={(v) => updateField("reserve", v)}
                />
              </div>
            </CollapsibleSection>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Puedes abrir como máximo</span>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-4xl font-bold tabular-nums">{sizing.contracts}</span>
                <span className="text-sm text-muted-foreground">
                  contratos · {formatNumber(sizing.btcExposure, 4)} BTC
                </span>
              </div>
              <div className="mt-1">
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Si el precio llega a tu umbral, pierdes</p>
                <p className="text-lg font-semibold tabular-nums text-negative">
                  {formatMoney(sizing.lossAtRisk)}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Apalancamiento
                  <InfoHint label="Apalancamiento">
                    Valor total de la posición dividido entre tu capital. 2× significa que mueves el doble de lo
                    que tienes.
                  </InfoHint>
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {sizing.leverage ? `${formatNumber(sizing.leverage, 2)}×` : "--"}
                </p>
              </div>
            </div>

            <CollapsibleSection title="Ver desglose completo" className="border-t border-border pt-3">
              <dl className="flex flex-col divide-y divide-border text-sm">
                <Row label="Valor de la posición (notional)" value={formatMoney(sizing.notional)} />
                <Row label="Initial margin intradía" value={formatMoney(dayMargin.toString())} />
                <Row label="Initial margin overnight" value={formatMoney(nightMargin.toString())} />
                <Row label="Equity estimado al precio de riesgo" value={formatMoney(sizing.equityAtRisk)} />
                <Row label="Maintenance margin al precio de riesgo" value={formatMoney(sizing.maintenanceAtRisk)} />
                <Row
                  label="Margin Ratio estimado al precio de riesgo"
                  value={
                    sizing.marginRatioAtRisk
                      ? `${new Decimal(sizing.marginRatioAtRisk).times(100).toFixed(1)}%`
                      : "≥100%"
                  }
                />
                <Row label="Comisiones entrada + salida" value={formatMoney(sizing.roundtripFees)} />
                <Row
                  label="Funding del período"
                  value={`${fundingSigned.isNegative() ? "Crédito " : ""}${formatMoney(fundingSigned.abs().toString())}`}
                />
                <Row label="Costo total estimado" value={formatMoney(sizing.totalCost)} />
              </dl>
            </CollapsibleSection>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <CollapsibleSection
            title="¿Y si el maintenance margin fuera distinto?"
            subtitle="Cómo cambia el máximo de contratos con otros MMR"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 font-normal">MMR</th>
                    <th className="py-2 text-right font-normal">Contratos máx.</th>
                    <th className="py-2 text-right font-normal">BTC</th>
                    <th className="py-2 text-right font-normal">Notional</th>
                    <th className="py-2 text-right font-normal">Leverage</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map(({ mmrPercent, result }) => (
                    <tr
                      key={mmrPercent}
                      className={cn("border-b border-border last:border-0", mmrPercent === state.mmr && "bg-accent/40")}
                    >
                      <td className="py-2">{mmrPercent}%</td>
                      <td className="py-2 text-right tabular-nums">{result.contracts}</td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(result.btcExposure, 2)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(result.notional)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {result.leverage ? `${formatNumber(result.leverage, 2)}×` : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        Esto es una estimación, no la liquidación real de Coinbase.
        <InfoHint label="Límites de esta calculadora">
          Esta calculadora no se conecta a tu cuenta ni puede conocer el maintenance margin vigente, position
          limit tier, funding futuro, slippage o cambios de reglas. El initial margin y el funding se prefiltran
          con los últimos valores sincronizados de Coinbase para el producto elegido, pero pueden quedar
          desactualizados si Coinbase los cambia. La liquidación real se basa en la salud total de margen de tu
          portafolio. Usa el Margin Ratio y el liquidation price estimate de Coinbase como fuente final.
        </InfoHint>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
