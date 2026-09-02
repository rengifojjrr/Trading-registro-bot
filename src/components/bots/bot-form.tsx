"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { saveBot, type BotFormState } from "@/app/(dashboard)/bots/actions";
import { NativeSelect } from "@/components/bots/native-select";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BotRecord } from "@/lib/bots/records";
import {
  BASELINE_SOURCE_LABELS,
  BLOCKS,
  BLOCK_HINTS,
  BLOCK_LABELS,
  PHASE_HINTS,
  PHASE_LABELS,
  PIPELINE_PHASES,
  STYLES,
  STYLE_BLOCK,
  STYLE_LABELS,
  type BotBlock,
  type BotStyle,
} from "@/lib/bots/types";

const initialState: BotFormState = { error: null, savedId: null };

/**
 * Dar de alta un bot, o editarlo.
 *
 * Lo primero que pide es la hipótesis: la frase de una línea que explica por
 * qué el mercado le paga. Es la primera puerta del método y va antes que
 * cualquier número, porque sin ella no hay estrategia, hay superstición.
 *
 * La línea base va plegada: un bot en F1 no tiene nada que prometer, y
 * enseñarle ocho casillas de cifras es invitar a inventarlas.
 */
export function BotForm({
  bot,
  options,
  onDone,
}: {
  bot?: BotRecord;
  options: { backtestStrategies: { id: string; name: string }[]; strategies: { id: string; name: string }[] };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveBot, initialState);
  const [style, setStyle] = useState<BotStyle>(bot?.style ?? "TENDENCIA");
  const [block, setBlock] = useState<BotBlock>(bot?.block ?? STYLE_BLOCK[bot?.style ?? "TENDENCIA"]);
  const [blockTouched, setBlockTouched] = useState(Boolean(bot));

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.savedId) {
      toast.success(bot ? "Bot guardado." : "Bot dado de alta.");
      if (bot) {
        router.refresh();
        onDone?.();
      } else {
        router.push(`/bots/${state.savedId}`);
      }
    }
  }, [state, bot, router, onDone]);

  const baseline = bot?.baseline;
  const tieneBaseline =
    baseline !== undefined &&
    (baseline.profitFactor !== null ||
      baseline.expectancyR !== null ||
      baseline.winRate !== null ||
      baseline.sharpe !== null ||
      baseline.maxDrawdownPct !== null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {bot ? <input type="hidden" name="id" value={bot.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nombre" htmlFor="bot-name" className="sm:col-span-2">
          <Input id="bot-name" name="name" required maxLength={80} defaultValue={bot?.name ?? ""} autoComplete="off" placeholder="p. ej. Atún (tendencia BTC 4h)" />
        </Campo>

        <Campo label="Hipótesis" htmlFor="bot-hypothesis" hint="Por qué el mercado le paga, en una frase. Sin esto no hay estrategia." className="sm:col-span-2">
          <Textarea
            id="bot-hypothesis"
            name="hypothesis"
            rows={2}
            maxLength={1000}
            defaultValue={bot?.hypothesis ?? ""}
            placeholder="p. ej. Tras una ruptura de rango con volumen, el precio tiende a continuar en la sesión de Nueva York."
          />
        </Campo>

        <Campo label="Mercado" htmlFor="bot-market">
          <Input id="bot-market" name="market" required maxLength={60} defaultValue={bot?.market ?? ""} placeholder="p. ej. BTC futuros (BIT)" autoComplete="off" />
        </Campo>

        <Campo label="Temporalidad" htmlFor="bot-timeframe">
          <Input id="bot-timeframe" name="timeframe" required maxLength={30} defaultValue={bot?.timeframe ?? ""} placeholder="p. ej. 4h" autoComplete="off" />
        </Campo>

        <Campo label="Familia" htmlFor="bot-style">
          <NativeSelect
            id="bot-style"
            name="style"
            value={style}
            onChange={(e) => {
              const nuevo = e.target.value as BotStyle;
              setStyle(nuevo);
              if (!blockTouched) setBlock(STYLE_BLOCK[nuevo]);
            }}
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>
                {STYLE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Campo>

        <Campo label="Bloque" htmlFor="bot-block" hint={BLOCK_HINTS[block]}>
          <NativeSelect
            id="bot-block"
            name="block"
            value={block}
            onChange={(e) => {
              setBlock(e.target.value as BotBlock);
              setBlockTouched(true);
            }}
          >
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                {BLOCK_LABELS[b]}
              </option>
            ))}
          </NativeSelect>
        </Campo>

        {!bot ? (
          <Campo label="Fase de entrada" htmlFor="bot-phase" hint="Un bot que viene de fuera con histórico puede entrar más arriba. Un prototipo entra por F1." className="sm:col-span-2">
            <NativeSelect id="bot-phase" name="phase" defaultValue="F1">
              {PIPELINE_PHASES.map((p) => (
                <option key={p} value={p}>
                  {p} · {PHASE_LABELS[p]} -- {PHASE_HINTS[p]}
                </option>
              ))}
            </NativeSelect>
          </Campo>
        ) : null}

        <Campo label="Tamaño asignado (% del capital)" htmlFor="bot-sizing" hint="Lo que opera de verdad. En staging se pone el 10% del objetivo.">
          <Input id="bot-sizing" name="sizingPct" type="number" min={0} max={100} step={0.5} defaultValue={bot?.sizingPct ?? 0} />
        </Campo>

        <Campo label="Riesgo por operación (%)" htmlFor="bot-risk">
          <Input id="bot-risk" name="riskPerTradePct" type="number" min={0} max={10} step={0.05} defaultValue={bot?.riskPerTradePct ?? 0.5} />
        </Campo>

        <Campo label="Magic number" htmlFor="bot-magic" hint="La matrícula del bot en la plataforma donde corre, para reconocer sus operaciones.">
          <Input id="bot-magic" name="magicNumber" maxLength={60} defaultValue={bot?.magicNumber ?? ""} autoComplete="off" />
        </Campo>

        <Campo label="Estrategia de backtest" htmlFor="bot-backtest">
          <NativeSelect id="bot-backtest" name="backtestStrategyId" defaultValue={bot?.backtestStrategyId ?? ""}>
            <option value="">Ninguna</option>
            {options.backtestStrategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Campo>

        <Campo label="Etiqueta de estrategia" htmlFor="bot-strategy" hint="La que se pone a sus operaciones en el diario.">
          <NativeSelect id="bot-strategy" name="strategyId" defaultValue={bot?.strategyId ?? ""}>
            <option value="">Ninguna</option>
            {options.strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Campo>

        <Campo label="Notas" htmlFor="bot-notes" className="sm:col-span-2">
          <Textarea id="bot-notes" name="notes" rows={3} maxLength={5000} defaultValue={bot?.notes ?? ""} placeholder="Parámetros, dónde corre, qué vigilar." />
        </Campo>
      </div>

      <CollapsibleSection
        title="Línea base: lo que promete"
        subtitle="Las cifras del backtest, o de su histórico. Contra esto se compara lo que hace en vivo."
        defaultOpen={tieneBaseline}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Profit factor" htmlFor="bl-pf">
            <Input id="bl-pf" name="baseline_profitFactor" inputMode="decimal" defaultValue={baseline?.profitFactor ?? ""} placeholder="p. ej. 1,8" />
          </Campo>
          <Campo label="Expectativa (R)" htmlFor="bl-exp">
            <Input id="bl-exp" name="baseline_expectancyR" inputMode="decimal" defaultValue={baseline?.expectancyR ?? ""} placeholder="p. ej. 0,3" />
          </Campo>
          <Campo label="Win rate (%)" htmlFor="bl-wr">
            <Input id="bl-wr" name="baseline_winRate" inputMode="decimal" defaultValue={baseline?.winRate ?? ""} placeholder="p. ej. 45" />
          </Campo>
          <Campo label="Sharpe" htmlFor="bl-sh">
            <Input id="bl-sh" name="baseline_sharpe" inputMode="decimal" defaultValue={baseline?.sharpe ?? ""} placeholder="p. ej. 1,4" />
          </Campo>
          <Campo label="Drawdown máximo (%)" htmlFor="bl-dd">
            <Input id="bl-dd" name="baseline_maxDrawdownPct" inputMode="decimal" defaultValue={baseline?.maxDrawdownPct ?? ""} placeholder="p. ej. 12" />
          </Campo>
          <Campo label="Operaciones al mes" htmlFor="bl-tpm">
            <Input id="bl-tpm" name="baseline_tradesPerMonth" inputMode="decimal" defaultValue={baseline?.tradesPerMonth ?? ""} />
          </Campo>
          <Campo label="Operaciones de muestra" htmlFor="bl-n">
            <Input id="bl-n" name="baseline_trades" inputMode="numeric" defaultValue={baseline?.trades ?? ""} placeholder="p. ej. 240" />
          </Campo>
          <Campo label="De dónde sale" htmlFor="bl-source">
            <NativeSelect id="bl-source" name="baseline_source" defaultValue={baseline?.source ?? "BACKTEST"}>
              {(["BACKTEST", "HISTORICO", "MANUAL"] as const).map((s) => (
                <option key={s} value={s}>
                  {BASELINE_SOURCE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo label="Nota" htmlFor="bl-note" className="sm:col-span-2 lg:col-span-4">
            <Input id="bl-note" name="baseline_note" maxLength={500} defaultValue={baseline?.note ?? ""} placeholder="p. ej. Backtest 2019-2025 sin optimizar, costes incluidos." />
          </Campo>
        </div>
      </CollapsibleSection>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : bot ? "Guardar cambios" : "Dar de alta"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Campo({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
