"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INDICATORS } from "@/lib/charts/indicators";
import {
  COMPARATOR_LABELS,
  type Comparator,
  type Condition,
  type Operand,
  type OperandKind,
  type PriceField,
} from "@/lib/backtest/types";

/**
 * Las condiciones de una estrategia, como frases.
 *
 * Cada una se lee de izquierda a derecha: «el cierre cruza hacia arriba la
 * EMA 21». No es un lenguaje ni un editor de fórmulas -- las dos cosas
 * obligan a aprender una sintaxis antes de poder probar la primera idea --
 * sino tres desplegables que sólo ofrecen lo que la plataforma sabe calcular.
 *
 * Eso último importa: aquí no se puede escribir una condición sobre un
 * indicador que no existe, así que no hay forma de guardar una estrategia que
 * luego no se pueda correr.
 */
const PRICE_LABELS: Record<PriceField, string> = {
  OPEN: "la apertura",
  HIGH: "el máximo",
  LOW: "el mínimo",
  CLOSE: "el cierre",
};

const KIND_LABELS: Record<OperandKind, string> = {
  PRECIO: "Precio",
  INDICADOR: "Indicador",
  NUMERO: "Número",
};

export function ConditionEditor({
  conditions,
  onChange,
  addLabel,
  emptyLabel,
}: {
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
  addLabel: string;
  emptyLabel: string;
}) {
  const nueva = (): Condition => ({
    left: { kind: "PRECIO", field: "CLOSE" },
    comparator: "CRUZA_ARRIBA",
    right: { kind: "INDICADOR", indicator: "EMA21" },
  });

  const set = (i: number, cond: Condition) =>
    onChange(conditions.map((c, j) => (j === i ? cond : c)));

  return (
    <div className="flex flex-col gap-2">
      {conditions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : null}

      {conditions.map((cond, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-secondary/30 p-2"
        >
          {i > 0 ? (
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              y
            </span>
          ) : null}

          <OperandEditor
            operand={cond.left}
            onChange={(left) => set(i, { ...cond, left })}
            label="lado izquierdo"
          />

          <Select
            value={cond.comparator}
            onValueChange={(v) => set(i, { ...cond, comparator: v as Comparator })}
          >
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="comparación">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COMPARATOR_LABELS) as Comparator[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {COMPARATOR_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <OperandEditor
            operand={cond.right}
            onChange={(right) => set(i, { ...cond, right })}
            label="lado derecho"
          />

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8"
            onClick={() => onChange(conditions.filter((_, j) => j !== i))}
            aria-label="Quitar esta condición"
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="h-8 w-fit gap-1.5 text-xs"
        onClick={() => onChange([...conditions, nueva()])}
        disabled={conditions.length >= 8}
      >
        <Plus className="size-3.5" aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

function OperandEditor({
  operand,
  onChange,
  label,
}: {
  operand: Operand;
  onChange: (next: Operand) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Select
        value={operand.kind}
        onValueChange={(v) => {
          const kind = v as OperandKind;
          // Al cambiar de tipo se pone un valor por defecto de ese tipo, en
          // vez de dejar el campo vacío: un operando a medias es una condición
          // que nunca se cumple, y eso parece un fallo del motor.
          if (kind === "PRECIO") onChange({ kind, field: "CLOSE" });
          else if (kind === "INDICADOR") onChange({ kind, indicator: "EMA21" });
          else onChange({ kind, value: 0 });
        }}
      >
        <SelectTrigger className="h-8 w-28 text-xs" aria-label={`tipo del ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(KIND_LABELS) as OperandKind[]).map((k) => (
            <SelectItem key={k} value={k}>
              {KIND_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {operand.kind === "PRECIO" ? (
        <Select
          value={operand.field ?? "CLOSE"}
          onValueChange={(v) => onChange({ ...operand, field: v as PriceField })}
        >
          <SelectTrigger className="h-8 w-32 text-xs" aria-label={`precio del ${label}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRICE_LABELS) as PriceField[]).map((f) => (
              <SelectItem key={f} value={f}>
                {PRICE_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {operand.kind === "INDICADOR" ? (
        <Select
          value={operand.indicator ?? "EMA21"}
          onValueChange={(v) => onChange({ ...operand, indicator: v as never })}
        >
          <SelectTrigger className="h-8 w-32 text-xs" aria-label={`indicador del ${label}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDICATORS.map((ind) => (
              <SelectItem key={ind.id} value={ind.id}>
                {ind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {operand.kind === "NUMERO" ? (
        <Input
          type="number"
          step="any"
          value={operand.value ?? 0}
          onChange={(e) => onChange({ ...operand, value: Number(e.target.value) })}
          className="h-8 w-24 text-xs"
          aria-label={`número del ${label}`}
        />
      ) : null}
    </div>
  );
}
