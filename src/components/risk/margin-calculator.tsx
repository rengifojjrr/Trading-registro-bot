"use client";

import { Decimal } from "decimal.js";
import { useMemo, useState } from "react";

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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string | number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
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
 * (validated against the tool's own PDF-documented worked example) instead
 * of re-deriving the formula. Two enhancements over the original: (1) a
 * direction toggle -- the prototype was LONG-only, calculateMaxContracts
 * already supports both; (2) day/night initial margin and funding prefill
 * from Coinbase's REAL synced rates for the selected product (see
 * lib/risk/product-margin.ts) instead of requiring the user to copy them in
 * by hand, though they stay editable since Coinbase can change them anytime.
 * Purely a client-side what-if scratchpad -- nothing here is persisted.
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

  function handleProductChange(productId: string) {
    const product = products.find((p) => p.productId === productId);
    const rates = ratesForDirection(product, state.direction);
    setState((s) => ({
      ...s,
      productId,
      ...(rates
        ? {
            imDay: new Decimal(rates.intradayMarginRate).times(100).toString(),
            imNight: new Decimal(rates.overnightMarginRate).times(100).toString(),
            funding: new Decimal(rates.fundingRatePerHour).times(100).toString(),
          }
        : {}),
    }));
  }

  function handleDirectionChange(direction: Direction) {
    const product = products.find((p) => p.productId === state.productId);
    const rates = ratesForDirection(product, direction);
    setState((s) => ({
      ...s,
      direction,
      ...(rates
        ? {
            imDay: new Decimal(rates.intradayMarginRate).times(100).toString(),
            imNight: new Decimal(rates.overnightMarginRate).times(100).toString(),
            funding: new Decimal(rates.fundingRatePerHour).times(100).toString(),
          }
        : {}),
    }));
  }

  const contractSize = products.find((p) => p.productId === state.productId)?.contractSize ?? "0.01";

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
        direction: state.direction,
        capital: safeDecimal(state.capital).toString(),
        reserveCash: safeDecimal(state.reserve).toString(),
        entryPrice: safeDecimal(state.entry).toString(),
        riskPrice: safeDecimal(state.riskPrice).toString(),
        hoursOpen: safeDecimal(state.hours).toString(),
      }),
    [state, contractSize],
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
          direction: state.direction,
          capital: safeDecimal(state.capital).toString(),
          reserveCash: safeDecimal(state.reserve).toString(),
          entryPrice: safeDecimal(state.entry).toString(),
          riskPrice: safeDecimal(state.riskPrice).toString(),
          hoursOpen: safeDecimal(state.hours).toString(),
        }),
      })),
    [state, contractSize],
  );

  const usable = Decimal.max(0, safeDecimal(state.capital).minus(safeDecimal(state.reserve)));
  const notional = new Decimal(sizing.notional);
  const dayMargin = notional.times(pct(state.imDay));
  const nightMargin = notional.times(pct(state.imNight));
  const nightOk = nightMargin.lte(usable);
  const riskOk = sizing.marginRatioAtRisk === null ? true : new Decimal(sizing.marginRatioAtRisk).lte(pct(state.targetMR));

  let statusLabel: string;
  let statusVariant: "positive" | "negative";
  if (sizing.contracts === 0) {
    statusLabel = "Parámetros incompatibles";
    statusVariant = "negative";
  } else if (!nightOk) {
    statusLabel = "No pasa margen overnight";
    statusVariant = "negative";
  } else if (!riskOk) {
    statusLabel = "Excede el margen objetivo";
    statusVariant = "negative";
  } else {
    statusLabel = "Dentro del modelo configurado";
    statusVariant = "positive";
  }

  const usedPct = Decimal.min(100, nightMargin.dividedBy(Decimal.max(1, usable)).times(100));
  const fundingSigned = new Decimal(sizing.fundingCost);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.25fr]">
        <Card>
          <CardHeader>
            <CardTitle>Calculadora -- parámetros</CardTitle>
            <CardDescription>
              Ajusta cualquier valor y el resultado se recalcula al instante. Nada de esto se guarda.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            <NumberField id="calc-capital" label="Capital disponible (USD)" value={state.capital} min={0} onChange={(v) => updateField("capital", v)} />
            <NumberField id="calc-entry" label="Precio de entrada BTC (USD)" value={state.entry} min={0} onChange={(v) => updateField("entry", v)} />
            <NumberField
              id="calc-risk-price"
              label={state.direction === "LONG" ? "Precio mínimo de riesgo (USD)" : "Precio máximo de riesgo (USD)"}
              value={state.riskPrice}
              min={0}
              onChange={(v) => updateField("riskPrice", v)}
            />
            <NumberField id="calc-hours" label="Horas estimadas abierta" value={state.hours} min={0} onChange={(v) => updateField("hours", v)} />

            <NumberField id="calc-mmr" label="Maintenance Margin Rate (%) -- usa el valor de Coinbase" value={state.mmr} min={0.01} max={100} step={0.1} onChange={(v) => updateField("mmr", v)} />
            <NumberField id="calc-target-mr" label="Margin Ratio máximo deseado al precio de riesgo (%)" value={state.targetMR} min={1} max={99} step={1} onChange={(v) => updateField("targetMR", v)} />

            <NumberField id="calc-im-day" label="Initial Margin intradía (%)" value={state.imDay} min={0} max={100} step={0.1} onChange={(v) => updateField("imDay", v)} />
            <NumberField id="calc-im-night" label="Initial Margin overnight (%)" value={state.imNight} min={0} max={100} step={0.1} onChange={(v) => updateField("imNight", v)} />

            <NumberField id="calc-funding" label="Funding promedio por hora (%)" value={state.funding} step={0.0001} onChange={(v) => updateField("funding", v)} />
            <NumberField id="calc-trade-fee" label="Trading fee por lado (%)" value={state.tradeFee} min={0} step={0.001} onChange={(v) => updateField("tradeFee", v)} />

            <NumberField id="calc-min-fee" label="Fee mínimo por contrato / lado (USD)" value={state.minFee} min={0} step={0.01} onChange={(v) => updateField("minFee", v)} />
            <NumberField id="calc-reserve" label="Reserva de efectivo que NO quieres arriesgar (USD)" value={state.reserve} min={0} step={100} onChange={(v) => updateField("reserve", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Máximo calculado por tu umbral de riesgo</CardDescription>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">{sizing.contracts}</span>
              <span className="text-sm text-muted-foreground">contratos</span>
            </div>
            <div>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <div className="h-3 overflow-hidden rounded-full border border-border bg-secondary">
                <div className="h-full bg-primary transition-all" style={{ width: `${usedPct.toFixed(2)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Con {formatMoney(state.capital)}, entrada en {formatMoney(state.entry)} y umbral en{" "}
                {formatMoney(state.riskPrice)}, el modelo limita la posición a {sizing.contracts} contratos (
                {formatNumber(sizing.btcExposure, 2)} BTC). El número está redondeado hacia abajo porque Coinbase
                opera estos contratos en enteros.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <p className="text-xs text-muted-foreground">Exposición BTC</p>
                <p className="text-lg font-semibold tabular-nums">{formatNumber(sizing.btcExposure, 4)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <p className="text-xs text-muted-foreground">Notional de entrada</p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(sizing.notional)}</p>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <p className="text-xs text-muted-foreground">Apalancamiento efectivo</p>
                <p className="text-lg font-semibold tabular-nums">
                  {sizing.leverage ? `${formatNumber(sizing.leverage, 2)}×` : "--"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <p className="text-xs text-muted-foreground">Pérdida si BTC llega al umbral</p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(sizing.lossAtRisk)}</p>
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium">Chequeo de margen</h3>
              <dl className="flex flex-col divide-y divide-border text-sm">
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Initial margin intradía</dt>
                  <dd className="tabular-nums">{formatMoney(dayMargin.toString())}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Initial margin overnight</dt>
                  <dd className="tabular-nums">{formatMoney(nightMargin.toString())}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Equity estimado al precio de riesgo</dt>
                  <dd className="tabular-nums">{formatMoney(sizing.equityAtRisk)}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Maintenance margin al precio de riesgo</dt>
                  <dd className="tabular-nums">{formatMoney(sizing.maintenanceAtRisk)}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Margin Ratio estimado al precio de riesgo</dt>
                  <dd className="tabular-nums">
                    {sizing.marginRatioAtRisk ? `${new Decimal(sizing.marginRatioAtRisk).times(100).toFixed(1)}%` : "≥100%"}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium">Costos estimados</h3>
              <dl className="flex flex-col divide-y divide-border text-sm">
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Entrada + salida</dt>
                  <dd className="tabular-nums">{formatMoney(sizing.roundtripFees)}</dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Funding del período</dt>
                  <dd className="tabular-nums">
                    {fundingSigned.isNegative() ? "Crédito " : ""}
                    {formatMoney(fundingSigned.abs().toString())}
                  </dd>
                </div>
                <div className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">Costo total estimado</dt>
                  <dd className="tabular-nums">{formatMoney(sizing.totalCost)}</dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escenarios rápidos</CardTitle>
          <CardDescription>
            Como el maintenance margin real puede cambiar, esta tabla muestra cómo cambia el máximo de contratos
            usando distintos MMR, manteniendo el resto de tus parámetros.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                    <td className="py-2 text-right tabular-nums">{result.leverage ? `${formatNumber(result.leverage, 2)}×` : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Esta calculadora no se conecta a tu cuenta ni puede conocer el maintenance margin vigente, position limit
        tier, funding futuro, slippage o cambios de reglas -- salvo el initial margin/funding, que se prefiltran con
        los últimos valores sincronizados de Coinbase para el producto elegido, pero pueden quedar desactualizados si
        Coinbase los cambia. La liquidación real de Coinbase se basa en la salud total de margen del portafolio y
        puede diferir de esta aproximación. Usa el Margin Ratio y el liquidation price estimate de Coinbase como
        fuente operativa final.
      </p>
    </div>
  );
}
