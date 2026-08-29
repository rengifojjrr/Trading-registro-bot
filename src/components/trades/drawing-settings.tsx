"use client";

import { Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_EXTENSION_LEVELS,
  DEFAULT_FIB_LEVELS,
  DEFAULT_GANN_LEVELS,
  WAVE_DEGREE_LABELS,
  hasParam,
  type DrawingStyle,
  type LineStyle,
  type WaveDegree,
} from "@/lib/charts/style";
import { TOOL_BY_ID, type ToolId } from "@/lib/charts/tools";
import { cn } from "@/lib/utils";

/**
 * Los ajustes de un dibujo, como en TradingView.
 *
 * Antes lo único configurable era el color, y ni eso se podía cambiar después
 * de dibujar. Ahora cada herramienta enseña **sus** parámetros -- los que
 * declara en el catálogo -- y no una lista genérica con la mitad apagada: un
 * control que no hace nada se toca una vez, no pasa nada, y se deja de confiar
 * en el resto del panel.
 *
 * Los cambios se aplican al momento, sin botón de guardar. Es un panel de
 * apariencia: se mira el gráfico mientras se toca, y tener que confirmar
 * rompe justo ese ida y vuelta.
 */
const COLORES = [
  "#38bdf8",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#e2e8f0",
];

const ANCHOS = [1, 2, 3, 4];

const ESTILOS: { value: LineStyle; label: string }[] = [
  { value: "SOLID", label: "Continua" },
  { value: "DASHED", label: "Discontinua" },
  { value: "DOTTED", label: "Punteada" },
];

/** Los conjuntos de niveles que se ofrecen de un clic, por familia. */
const PRESETS: Partial<Record<ToolId, { label: string; levels: number[] }[]>> = {
  FIB: [
    { label: "Clásicos", levels: [...DEFAULT_FIB_LEVELS] },
    { label: "Sólo los tres", levels: [0, 0.382, 0.5, 0.618, 1] },
    { label: "Con extensiones", levels: [0, 0.382, 0.5, 0.618, 1, 1.272, 1.618] },
  ],
  FIB_EXTENSION: [
    { label: "Clásicos", levels: [...DEFAULT_EXTENSION_LEVELS] },
    { label: "Ampliados", levels: [0, 0.618, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236] },
  ],
  GANN_BOX: [
    { label: "Cuartos", levels: [...DEFAULT_GANN_LEVELS] },
    { label: "Octavos", levels: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] },
    { label: "Tercios", levels: [0, 0.333, 0.5, 0.667, 1] },
  ],
};

export function DrawingSettings({
  tool,
  style,
  onChange,
  onDelete,
  onClose,
}: {
  tool: ToolId;
  style: DrawingStyle;
  onChange: (next: DrawingStyle) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const meta = TOOL_BY_ID[tool];
  const set = <K extends keyof DrawingStyle>(key: K, value: DrawingStyle[K]) =>
    onChange({ ...style, [key]: value });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium">{meta.label}</h3>
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Borrar el dibujo">
            <Trash2 className="size-4 text-negative" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar los ajustes">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {hasParam(tool, "color") ? (
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={style.color === c}
                onClick={() => set("color", c)}
                style={{ backgroundColor: c }}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform",
                  style.color === c ? "scale-110 border-foreground" : "border-transparent",
                )}
              />
            ))}
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "lineWidth") ? (
        <Field label="Grosor">
          <div className="flex gap-1.5">
            {ANCHOS.map((w) => (
              <Chip key={w} active={style.lineWidth === w} onClick={() => set("lineWidth", w)}>
                {w}
              </Chip>
            ))}
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "lineStyle") ? (
        <Field label="Trazo">
          <div className="flex flex-wrap gap-1.5">
            {ESTILOS.map((e) => (
              <Chip
                key={e.value}
                active={style.lineStyle === e.value}
                onClick={() => set("lineStyle", e.value)}
              >
                {e.label}
              </Chip>
            ))}
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "fill") ? (
        <Field label="Relleno">
          <div className="flex flex-wrap items-center gap-3">
            <Chip active={style.fill} onClick={() => set("fill", !style.fill)}>
              {style.fill ? "Con relleno" : "Sin relleno"}
            </Chip>
            {style.fill && hasParam(tool, "fillOpacity") ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Opacidad
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={style.fillOpacity}
                  onChange={(e) => set("fillOpacity", Number(e.target.value))}
                  aria-label="Opacidad del relleno"
                  className="w-28"
                />
                <span className="w-8 tabular-nums">{style.fillOpacity}%</span>
              </label>
            ) : null}
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "extendLeft") || hasParam(tool, "extendRight") ? (
        <Field label="Prolongar">
          <div className="flex gap-1.5">
            {hasParam(tool, "extendLeft") ? (
              <Chip active={style.extendLeft} onClick={() => set("extendLeft", !style.extendLeft)}>
                Hacia la izquierda
              </Chip>
            ) : null}
            {hasParam(tool, "extendRight") ? (
              <Chip active={style.extendRight} onClick={() => set("extendRight", !style.extendRight)}>
                Hacia la derecha
              </Chip>
            ) : null}
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "levels") ? (
        <Field label="Niveles">
          <div className="flex flex-col gap-2">
            {PRESETS[tool] ? (
              <div className="flex flex-wrap gap-1.5">
                {PRESETS[tool]!.map((preset) => (
                  <Chip
                    key={preset.label}
                    active={
                      preset.levels.length === style.levels.length &&
                      preset.levels.every((n, i) => n === style.levels[i])
                    }
                    onClick={() => set("levels", [...preset.levels].sort((a, b) => a - b))}
                  >
                    {preset.label}
                  </Chip>
                ))}
              </div>
            ) : null}
            {/* Uno a uno: quitar el 78,6% porque nunca lo miras es exactamente
                el tipo de ajuste que hace que el gráfico deje de estorbar. */}
            <div className="flex flex-wrap gap-1">
              {nivelesOfrecidos(tool, style.levels).map((nivel) => (
                <Chip
                  key={nivel}
                  active={style.levels.includes(nivel)}
                  onClick={() =>
                    set(
                      "levels",
                      style.levels.includes(nivel)
                        ? style.levels.filter((n) => n !== nivel)
                        : [...style.levels, nivel].sort((a, b) => a - b),
                    )
                  }
                >
                  {(nivel * 100).toFixed(1).replace(/\.0$/, "")}%
                </Chip>
              ))}
            </div>
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "waveDegree") ? (
        <Field label="Grado de la onda">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(WAVE_DEGREE_LABELS) as WaveDegree[]).map((g) => (
              <Chip key={g} active={style.waveDegree === g} onClick={() => set("waveDegree", g)}>
                {WAVE_DEGREE_LABELS[g]}
              </Chip>
            ))}
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "showPrice") || hasParam(tool, "showLabels") || hasParam(tool, "riskReward") ? (
        <Field label="Qué se escribe">
          <div className="flex flex-wrap gap-1.5">
            {hasParam(tool, "showPrice") ? (
              <Chip active={style.showPrice} onClick={() => set("showPrice", !style.showPrice)}>
                Precios
              </Chip>
            ) : null}
            {hasParam(tool, "showLabels") ? (
              <Chip active={style.showLabels} onClick={() => set("showLabels", !style.showLabels)}>
                Etiquetas
              </Chip>
            ) : null}
            {hasParam(tool, "riskReward") ? (
              <Chip active={style.riskReward} onClick={() => set("riskReward", !style.riskReward)}>
                Beneficio/riesgo
              </Chip>
            ) : null}
          </div>
        </Field>
      ) : null}

      {hasParam(tool, "accountSize") ? (
        <Field label="Tamaño desde el riesgo">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cuenta" className="text-xs text-muted-foreground">
                Capital
              </Label>
              <Input
                id="cuenta"
                type="number"
                inputMode="decimal"
                min={0}
                step={100}
                value={style.accountSize ?? ""}
                onChange={(e) =>
                  set("accountSize", e.target.value === "" ? null : Number(e.target.value))
                }
                className="h-8 w-32"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="riesgo" className="text-xs text-muted-foreground">
                Riesgo (%)
              </Label>
              <Input
                id="riesgo"
                type="number"
                inputMode="decimal"
                min={0.01}
                max={100}
                step={0.25}
                value={style.riskPercent ?? ""}
                onChange={(e) =>
                  set("riskPercent", e.target.value === "" ? null : Number(e.target.value))
                }
                className="h-8 w-24"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Con los dos puestos, la herramienta dice cuántos contratos salen de ese riesgo. En
            blanco, sólo enseña la relación beneficio/riesgo.
          </p>
        </Field>
      ) : null}

      {hasParam(tool, "textLabel") ? (
        <Field label="Nota">
          <Input
            value={style.textLabel}
            onChange={(e) => set("textLabel", e.target.value)}
            maxLength={80}
            placeholder="Ej.: soporte de la semana"
            className="h-8"
          />
        </Field>
      ) : null}
    </div>
  );
}

/**
 * Qué niveles se ofrecen para marcar uno a uno.
 *
 * Los de la familia más los que el dibujo ya tenga: así una configuración
 * traída de otro sitio no pierde un nivel raro sólo por no estar en la lista.
 */
function nivelesOfrecidos(tool: ToolId, actuales: number[]): number[] {
  const base =
    tool === "FIB_EXTENSION"
      ? [0, 0.382, 0.5, 0.618, 1, 1.272, 1.618, 2, 2.618, 3.618, 4.236]
      : tool === "GANN_BOX"
        ? [0, 0.125, 0.25, 0.333, 0.375, 0.5, 0.625, 0.667, 0.75, 0.875, 1]
        : [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];

  return [...new Set([...base, ...actuales])].sort((a, b) => a - b);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
