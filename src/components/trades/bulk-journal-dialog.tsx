"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { applyJournalToTrades } from "@/app/(dashboard)/trades/bulk-journal-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BulkMode, BulkPlan, BulkValues } from "@/lib/journal/bulk-apply";
import { MISTAKE_CODES, MISTAKE_META, type MistakeCode } from "@/lib/journal/mistakes";

const EMOTION_OPTIONS = ["Calma", "Ansiedad", "Confianza", "Miedo", "Euforia", "Frustración", "FOMO"];
const RATINGS = [1, 2, 3, 4, 5];

/**
 * Apuntar lo mismo en varias operaciones a la vez.
 *
 * Solo se escribe lo que se rellena: dejar un campo en blanco es «no lo toques»,
 * no «vacíalo». Y antes de guardar se enseña qué se va a cambiar y cuánto se va
 * a pisar, porque «se van a reemplazar 3 notas» es una frase que hace cambiar
 * de opinión y «¿seguro?» no.
 *
 * No están el riesgo, el stop, el objetivo ni el resultado en R a propósito:
 * son números de cada operación concreta, y ponerle el mismo stop a doce
 * entradas distintas no es cómodo, es falso.
 */
export function BulkJournalDialog({
  tradeIds,
  strategies,
  onClose,
  onApplied,
}: {
  tradeIds: string[];
  strategies: { id: string; name: string }[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [mistakes, setMistakes] = useState<MistakeCode[]>([]);
  const [emotions, setEmotions] = useState<string[]>([]);
  const [strategyId, setStrategyId] = useState<string>("");
  const [planAdherence, setPlanAdherence] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [lesson, setLesson] = useState("");
  const [mode, setMode] = useState<BulkMode>("FILL_EMPTY");
  const [plan, setPlan] = useState<BulkPlan | null>(null);
  const [isPending, startTransition] = useTransition();

  const values: BulkValues = {
    ...(mistakes.length > 0 ? { mistakes } : {}),
    ...(emotions.length > 0 ? { emotional_state: emotions } : {}),
    ...(strategyId !== "" ? { strategy_id: strategyId } : {}),
    ...(planAdherence !== null ? { plan_adherence: planAdherence } : {}),
    ...(notes.trim() !== "" ? { notes } : {}),
    ...(lesson.trim() !== "" ? { lesson_learned: lesson } : {}),
  };

  const nadaMarcado = Object.keys(values).length === 0;
  const valuesKey = JSON.stringify(values) + mode;

  // La vista previa se recalcula al cambiar algo, con una espera corta: sin
  // ella cada tecla de las notas dispararía una consulta.
  // Si no hay nada marcado no se consulta, y la vista previa se deriva abajo
  // en vez de vaciarse desde el efecto: guardar `null` aquí sería un render
  // en cascada para representar un estado que ya se sabe sin guardarlo.
  useEffect(() => {
    if (nadaMarcado) return;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await applyJournalToTrades({ tradeIds, values, mode, dryRun: true });
        setPlan(result.plan);
      });
    }, 350);
    return () => clearTimeout(timer);
    // `valuesKey` resume el contenido de `values`, que se reconstruye en cada
    // render y como objeto nunca sería igual a sí mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, nadaMarcado, tradeIds]);

  function apply() {
    startTransition(async () => {
      const result = await applyJournalToTrades({ tradeIds, values, mode });

      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.applied) {
        toast.info("No había nada que cambiar.");
        return;
      }

      toast.success(
        `Apuntadas ${tradeIds.length} operaci${tradeIds.length === 1 ? "ón" : "ones"}.`,
        { description: result.plan?.summary },
      );
      onApplied();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 py-[6vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Apuntar varias operaciones"
        className="flex w-full max-w-2xl flex-col gap-5 rounded-lg border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">
            Apuntar {tradeIds.length} operaci{tradeIds.length === 1 ? "ón" : "ones"} a la vez
          </h2>
          <p className="text-sm text-muted-foreground">
            Lo que dejes en blanco no se toca. El riesgo, el stop y el objetivo no están aquí: son
            números de cada operación, y poner el mismo en todas sería inventárselo.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Errores</legend>
          <div className="flex flex-wrap gap-1.5">
            {MISTAKE_CODES.map((code) => (
              <Chip
                key={code}
                label={MISTAKE_META[code].label}
                title={MISTAKE_META[code].description}
                active={mistakes.includes(code)}
                onToggle={() =>
                  setMistakes((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]))
                }
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Emociones</legend>
          <div className="flex flex-wrap gap-1.5">
            {EMOTION_OPTIONS.map((emotion) => (
              <Chip
                key={emotion}
                label={emotion}
                active={emotions.includes(emotion)}
                onToggle={() =>
                  setEmotions((c) =>
                    c.includes(emotion) ? c.filter((x) => x !== emotion) : [...c, emotion],
                  )
                }
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-strategy">Estrategia</Label>
            <select
              id="bulk-strategy"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
            >
              <option value="">Sin cambiar</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Adherencia al plan</legend>
            <div className="flex gap-1.5">
              {RATINGS.map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  active={planAdherence === n}
                  onToggle={() => setPlanAdherence(planAdherence === n ? null : n)}
                />
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-lesson">Lección aprendida</Label>
          <Textarea
            id="bulk-lesson"
            rows={2}
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            placeholder="Lo mismo para todas. En blanco, no se toca."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-notes">Notas</Label>
          <Textarea
            id="bulk-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej.: ráfaga de FOMO después de la pérdida de la mañana."
          />
        </div>

        <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Si ya había algo escrito</legend>
          <ModeOption
            checked={mode === "FILL_EMPTY"}
            onSelect={() => setMode("FILL_EMPTY")}
            title="Rellenar solo lo vacío"
            detail="Respeta lo que ya apuntaste en cada operación."
          />
          <ModeOption
            checked={mode === "OVERWRITE"}
            onSelect={() => setMode("OVERWRITE")}
            title="Reemplazar lo que haya"
            detail="Lo que ya estuviera escrito en esos campos se pierde."
          />
        </fieldset>

        <PlanPreview plan={nadaMarcado ? null : plan} loading={isPending} nadaMarcado={nadaMarcado} />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={apply}
            disabled={isPending || nadaMarcado || (plan !== null && plan.totalWrites === 0)}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Apuntar {tradeIds.length}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlanPreview({
  plan,
  loading,
  nadaMarcado,
}: {
  plan: BulkPlan | null;
  loading: boolean;
  nadaMarcado: boolean;
}) {
  if (nadaMarcado) {
    return (
      <p className="text-sm text-muted-foreground">
        Marca al menos un campo para ver qué se cambiaría.
      </p>
    );
  }
  if (!plan) {
    return (
      <p className="text-sm text-muted-foreground">
        {loading ? "Comprobando qué cambiaría…" : " "}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/30 p-3">
      <p className="text-sm">{plan.summary}</p>

      {plan.warning ? (
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {plan.warning}
        </p>
      ) : null}

      {plan.fields.some((f) => f.skipped > 0) ? (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {plan.fields
            .filter((f) => f.skipped > 0)
            .map((f) => (
              <li key={f.field}>
                {f.label}: se respetan {f.skipped} que ya tenían valor.
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function Chip({
  label,
  title,
  active,
  onToggle,
}: {
  label: string;
  title?: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ModeOption({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input
        type="radio"
        name="bulk-mode"
        checked={checked}
        onChange={onSelect}
        className="mt-1"
      />
      <span className="flex flex-col">
        <span>{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}
