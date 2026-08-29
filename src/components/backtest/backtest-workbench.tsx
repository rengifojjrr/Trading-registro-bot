"use client";

import { Play, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConditionEditor } from "@/components/backtest/condition-editor";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runBacktest } from "@/lib/backtest/engine";
import { computeMetrics, type BacktestMetrics } from "@/lib/backtest/metrics";
import { validateStrategy } from "@/lib/backtest/rules";
import { EMPTY_STRATEGY, EXIT_REASON_LABELS, type BacktestCosts, type ExitReason, type Strategy } from "@/lib/backtest/types";
import type { Vela } from "@/lib/charts/indicators";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { saveBacktestStrategy, deleteBacktestStrategy } from "@/app/(dashboard)/backtest/actions";

/**
 * El taller: escribir una estrategia, correrla y ver qué habría pasado.
 *
 * El backtest corre **en el navegador**, no en el servidor. Es una función
 * pura sobre velas que ya están cargadas en la página, así que mandarlas al
 * servidor para que las devuelva calculadas sólo añadiría una ida y vuelta.
 * Y el efecto secundario es el que importa: cambiar un parámetro y ver el
 * resultado al momento es lo que convierte esto en algo con lo que se juega,
 * en vez de en un formulario que se envía.
 */
export function BacktestWorkbench({
  candles,
  productId,
  contractSize,
  stored,
}: {
  candles: Vela[];
  productId: string;
  contractSize: number;
  stored: { id: string; name: string; strategy: Strategy; costs: BacktestCosts }[];
}) {
  const [strategy, setStrategy] = useState<Strategy>(() =>
    stored[0] ? stored[0].strategy : { ...EMPTY_STRATEGY, name: "Mi primera regla" },
  );
  const [costs, setCosts] = useState<BacktestCosts>(() =>
    stored[0] ? stored[0].costs : { feePerContract: 0.5, slippageTicks: 1, tickSize: 1 },
  );
  const [loadedId, setLoadedId] = useState<string | null>(stored[0]?.id ?? null);
  const [saving, setSaving] = useState(false);

  /** Resultado de la última ejecución, o null si todavía no se corrió. */
  const [result, setResult] = useState<{
    metrics: BacktestMetrics;
    note: string | null;
    barsEvaluated: number;
  } | null>(null);

  const problemas = useMemo(() => validateStrategy(strategy), [strategy]);

  function correr() {
    if (problemas.length > 0) {
      toast.error(problemas[0]);
      return;
    }
    const salida = runBacktest({ strategy, velas: candles, productId, costs });
    setResult({
      metrics: computeMetrics(salida.trades, contractSize),
      note: salida.note,
      barsEvaluated: salida.barsEvaluated,
    });
  }

  async function guardar() {
    setSaving(true);
    try {
      const formData = new FormData();
      if (loadedId) formData.set("id", loadedId);
      formData.set("strategy", JSON.stringify(strategy));
      formData.set("costs", JSON.stringify(costs));
      formData.set("productId", productId);

      const res = await saveBacktestStrategy({ error: null, savedId: null }, formData);
      if (res.error) toast.error(res.error);
      else {
        setLoadedId(res.savedId);
        toast.success("Estrategia guardada.");
      }
    } finally {
      setSaving(false);
    }
  }

  function cargar(id: string) {
    const guardada = stored.find((s) => s.id === id);
    if (!guardada) return;
    setStrategy(guardada.strategy);
    setCosts(guardada.costs);
    setLoadedId(guardada.id);
    // Un resultado de otra estrategia debajo de esta sería la peor clase de
    // error: uno que parece un dato.
    setResult(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>La regla</CardTitle>
            <CardDescription>
              Se lee de izquierda a derecha. Sólo se ofrece lo que la plataforma sabe calcular, así
              que no hay forma de escribir una regla que luego no se pueda correr.
            </CardDescription>
          </div>

          {stored.length > 0 ? (
            <Select value={loadedId ?? ""} onValueChange={cargar}>
              <SelectTrigger className="h-8 w-52 text-xs" aria-label="Estrategias guardadas">
                <SelectValue placeholder="Cargar una guardada…" />
              </SelectTrigger>
              <SelectContent>
                {stored.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bt-nombre" className="text-xs">
                Nombre
              </Label>
              <Input
                id="bt-nombre"
                value={strategy.name}
                onChange={(e) => setStrategy({ ...strategy, name: e.target.value })}
                maxLength={80}
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bt-direccion" className="text-xs">
                Dirección
              </Label>
              <Select
                value={strategy.direction}
                onValueChange={(v) =>
                  setStrategy({ ...strategy, direction: v as Strategy["direction"] })
                }
              >
                <SelectTrigger id="bt-direccion" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LONG">Sólo largos</SelectItem>
                  <SelectItem value="SHORT">Sólo cortos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bt-size" className="text-xs">
                Contratos
              </Label>
              <Input
                id="bt-size"
                type="number"
                min={1}
                step={1}
                value={strategy.size}
                onChange={(e) => setStrategy({ ...strategy, size: Number(e.target.value) })}
                className="h-8"
              />
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Se entra cuando…</h3>
            <ConditionEditor
              conditions={strategy.entry}
              onChange={(entry) => setStrategy({ ...strategy, entry })}
              addLabel="Añadir condición de entrada"
              emptyLabel="Sin ninguna condición no hay nada que probar."
            />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Se sale cuando…</h3>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumberOrOff
                id="bt-stop"
                label="Stop, en ATR"
                hint="En múltiplos de lo que se mueve el mercado, no en dólares: cien dólares son enormes en una sesión tranquila y ridículos en una volátil."
                value={strategy.exit.stopAtr}
                onChange={(stopAtr) => setStrategy({ ...strategy, exit: { ...strategy.exit, stopAtr } })}
              />
              <NumberOrOff
                id="bt-target"
                label="Objetivo, en ATR"
                hint="Igual que el stop. Con 2 de stop y 3 de objetivo, el ratio es 1,5."
                value={strategy.exit.targetAtr}
                onChange={(targetAtr) =>
                  setStrategy({ ...strategy, exit: { ...strategy.exit, targetAtr } })
                }
              />
              <NumberOrOff
                id="bt-bars"
                label="Máximo de velas"
                hint="Cierra por tiempo si no saltó ni el stop ni el objetivo."
                value={strategy.exit.maxBars}
                onChange={(maxBars) => setStrategy({ ...strategy, exit: { ...strategy.exit, maxBars } })}
                integer
              />
            </div>

            <ConditionEditor
              conditions={strategy.exit.conditions}
              onChange={(conditions) => setStrategy({ ...strategy, exit: { ...strategy.exit, conditions } })}
              addLabel="Añadir condición de salida"
              emptyLabel="Opcional: además del stop y el objetivo, cerrar si se cumple algo."
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Los costes</h3>
            <p className="text-xs text-muted-foreground">
              Sin ellos un backtest de estrategias rápidas sale siempre ganando: en el papel se
              entra al precio exacto de la vela y en el mercado no.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <CostField
                id="bt-fee"
                label="Comisión por contrato"
                value={costs.feePerContract}
                onChange={(feePerContract) => setCosts({ ...costs, feePerContract })}
              />
              <CostField
                id="bt-slip"
                label="Deslizamiento, en ticks"
                value={costs.slippageTicks}
                onChange={(slippageTicks) => setCosts({ ...costs, slippageTicks })}
              />
              <CostField
                id="bt-tick"
                label="Tamaño del tick"
                value={costs.tickSize}
                onChange={(tickSize) => setCosts({ ...costs, tickSize })}
              />
            </div>
          </section>

          {problemas.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 p-3">
              {problemas.map((p) => (
                <li key={p} className="text-xs text-warning-foreground">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={correr} disabled={problemas.length > 0} className="gap-1.5">
              <Play className="size-4" aria-hidden />
              Correr sobre {candles.length} velas
            </Button>
            <Button variant="outline" onClick={() => void guardar()} disabled={saving} className="gap-1.5">
              <Save className="size-4" aria-hidden />
              {loadedId ? "Guardar cambios" : "Guardar"}
            </Button>
            {loadedId ? (
              <Button
                variant="ghost"
                className="gap-1.5 text-negative"
                onClick={async () => {
                  await deleteBacktestStrategy(loadedId);
                  setLoadedId(null);
                  toast.success("Estrategia borrada.");
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Borrar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {result ? <Results result={result} /> : null}
    </div>
  );
}

function Results({
  result,
}: {
  result: { metrics: BacktestMetrics; note: string | null; barsEvaluated: number };
}) {
  const { metrics, note, barsEvaluated } = result;

  if (metrics.operaciones === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ninguna operación</CardTitle>
          <CardDescription>
            {/* Decir por qué y no sólo «cero»: «cero operaciones» hace pensar
                que la idea no funciona, cuando lo que pasa es que la condición
                no se cumplió nunca. */}
            {note ?? "La regla no llegó a entrar en ninguna vela."} Se miraron {barsEvaluated} velas.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const neto = Number(metrics.neto);
  const esperanza = Number(metrics.esperanza);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          size="lg"
          label="Resultado neto"
          value={formatMoney(neto)}
          tone={neto >= 0 ? "positive" : "negative"}
          sub={`${metrics.operaciones} operaciones`}
        />
        <StatTile
          size="lg"
          label="Esperanza por operación"
          value={formatMoney(esperanza)}
          tone={esperanza >= 0 ? "positive" : "negative"}
          sub="lo que se espera ganar cada vez"
        />
        <StatTile
          size="lg"
          label="Aciertos"
          value={`${metrics.aciertos.toFixed(1)}%`}
          sub={`${metrics.ganadoras} de ${metrics.operaciones}`}
        />
        <StatTile
          size="lg"
          label="Peor caída"
          value={formatMoney(-Number(metrics.drawdown))}
          tone="negative"
          sub="desde un máximo de la curva"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo se cerraron</CardTitle>
          <CardDescription>
            Muchas por tiempo suele querer decir que el objetivo está demasiado lejos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {(Object.keys(metrics.porMotivo) as ExitReason[])
              .filter((r) => metrics.porMotivo[r] > 0)
              .map((r) => (
                <li key={r} className="flex items-center justify-between gap-4 py-2">
                  <span>{EXIT_REASON_LABELS[r]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {metrics.porMotivo[r]}
                  </span>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Los números finos</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Ganadora media" value={formatMoney(Number(metrics.mediaGanadora))} />
            <Row label="Perdedora media" value={formatMoney(-Number(metrics.mediaPerdedora))} />
            <Row label="Ratio ganadora/perdedora" value={metrics.ratio ?? "--"} />
            <Row label="Racha ganadora más larga" value={String(metrics.rachaGanadora)} />
            <Row label="Racha perdedora más larga" value={String(metrics.rachaPerdedora)} />
            <Row label="Velas miradas" value={String(barsEvaluated)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Un número que se puede apagar.
 *
 * «Sin stop» y «stop de cero» son cosas distintas, y un campo numérico solo no
 * puede decir la primera: cero significaría un stop pegado a la entrada.
 */
function NumberOrOff({
  id,
  label,
  hint,
  value,
  onChange,
  integer = false,
}: {
  id: string;
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
  integer?: boolean;
}) {
  const apagado = value === null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          min={integer ? 1 : 0.1}
          step={integer ? 1 : 0.1}
          value={apagado ? "" : value}
          placeholder="sin usar"
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="h-8"
        />
        <button
          type="button"
          onClick={() => onChange(apagado ? (integer ? 20 : 2) : null)}
          className={cn(
            "shrink-0 rounded px-2 py-1 text-[11px] transition-colors",
            apagado
              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
              : "bg-accent text-foreground",
          )}
        >
          {apagado ? "usar" : "quitar"}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

function CostField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8"
      />
    </div>
  );
}
