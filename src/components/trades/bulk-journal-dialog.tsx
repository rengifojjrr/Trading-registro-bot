"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { applyJournalToTrades } from "@/app/(dashboard)/trades/bulk-journal-actions";
import {
  listJournalTemplates,
  markTemplateUsed,
  saveJournalTemplate,
} from "@/app/(dashboard)/trades/template-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  BulkMode,
  BulkPlan,
  BulkValues,
  PlannedDirection,
} from "@/lib/journal/bulk-apply";
import { HTF_BIAS_OPTIONS, RATING_OPTIONS, SR_PROXIMITY_OPTIONS } from "@/lib/journal/options";
import { describeTemplate, type JournalTemplateRow } from "@/lib/journal/saved-templates";
import { MISTAKE_CODES, MISTAKE_META, type MistakeCode } from "@/lib/journal/mistakes";
import { SETUP_GRADES, type SetupGrade } from "@/lib/journal/setup-grade";

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
 * Están las mismas preguntas que la ficha de una operación y en el mismo orden
 * -- el plan, cómo salió y qué te llevas -- porque son el mismo diario. Faltaban
 * la nota del setup, el sesgo, dónde estaba el precio, la dirección planeada y
 * la calidad de entrada: eran preguntas que sólo se podían contestar de una en
 * una, así que en una ráfaga de doce entradas se quedaban sin contestar.
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
  const [setupGrade, setSetupGrade] = useState<SetupGrade | null>(null);
  const [plannedDirection, setPlannedDirection] = useState<PlannedDirection | null>(null);
  const [htfBias, setHtfBias] = useState<string>("");
  const [srProximity, setSrProximity] = useState<string>("");
  const [planAdherence, setPlanAdherence] = useState<number | null>(null);
  const [entryQuality, setEntryQuality] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [lesson, setLesson] = useState("");
  const [mode, setMode] = useState<BulkMode>("FILL_EMPTY");
  const [plan, setPlan] = useState<BulkPlan | null>(null);
  const [templates, setTemplates] = useState<JournalTemplateRow[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setTemplates(await listJournalTemplates());
    });
  }, []);

  /** Rellena el formulario con lo guardado. No aplica nada todavía. */
  function loadTemplate(template: JournalTemplateRow) {
    const v = template.values;
    setMistakes(v.mistakes ?? []);
    setEmotions(v.emotional_state ?? []);
    setStrategyId(v.strategy_id ?? "");
    setSetupGrade(v.setup_grade ?? null);
    setPlannedDirection(v.planned_direction ?? null);
    setHtfBias(v.htf_bias ?? "");
    setSrProximity(v.sr_proximity ?? "");
    setPlanAdherence(v.plan_adherence ?? null);
    setEntryQuality(v.entry_quality ?? null);
    setNotes(v.notes ?? "");
    setLesson(v.lesson_learned ?? "");
    startTransition(() => markTemplateUsed(template.id));
  }

  function saveAsTemplate() {
    const nombre = window.prompt("¿Cómo se llama esta combinación?", "Ráfaga de FOMO");
    if (nombre === null) return;

    startTransition(async () => {
      const result = await saveJournalTemplate(nombre, values as Record<string, unknown>);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Plantilla guardada.", {
        description: "La próxima vez la tienes arriba, en un clic.",
      });
      setTemplates(await listJournalTemplates());
    });
  }

  const values: BulkValues = {
    ...(mistakes.length > 0 ? { mistakes } : {}),
    ...(emotions.length > 0 ? { emotional_state: emotions } : {}),
    ...(strategyId !== "" ? { strategy_id: strategyId } : {}),
    ...(setupGrade !== null ? { setup_grade: setupGrade } : {}),
    ...(plannedDirection !== null ? { planned_direction: plannedDirection } : {}),
    ...(htfBias !== "" ? { htf_bias: htfBias } : {}),
    ...(srProximity !== "" ? { sr_proximity: srProximity } : {}),
    ...(planAdherence !== null ? { plan_adherence: planAdherence } : {}),
    ...(entryQuality !== null ? { entry_quality: entryQuality } : {}),
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

        {templates.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              Lo de siempre (los errores se repiten -- por eso son errores):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  title={describeTemplate(template.values)}
                  onClick={() => loadTemplate(template)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* El mismo orden que la ficha de una operación: lo que pensabas
            antes, cómo lo ejecutaste, y qué te llevas. Es el mismo diario, así
            que preguntarlo en otro orden obligaría a aprendérselo dos veces. */}
        <Grupo titulo="El plan" subtitulo="Lo que tenías pensado antes de entrar">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-strategy">Estrategia</Label>
              <Desplegable
                id="bulk-strategy"
                value={strategyId}
                onChange={setStrategyId}
                options={strategies.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Setup</legend>
              <div className="flex flex-wrap gap-1.5">
                {SETUP_GRADES.map((grade) => (
                  <Chip
                    key={grade}
                    label={grade}
                    title={`Marcar estas operaciones como setup ${grade}`}
                    active={setupGrade === grade}
                    onToggle={() => setSetupGrade(setupGrade === grade ? null : grade)}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Dirección planeada</legend>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["LONG", "Long"],
                    ["SHORT", "Short"],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    label={label}
                    active={plannedDirection === value}
                    onToggle={() =>
                      setPlannedDirection(plannedDirection === value ? null : value)
                    }
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-htf">Sesgo de temporalidad alta</Label>
              <Desplegable
                id="bulk-htf"
                value={htfBias}
                onChange={setHtfBias}
                options={HTF_BIAS_OPTIONS.map((o) => ({ value: o, label: o }))}
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="bulk-sr">Proximidad a soporte/resistencia</Label>
              <Desplegable
                id="bulk-sr"
                value={srProximity}
                onChange={setSrProximity}
                options={SR_PROXIMITY_OPTIONS.map((o) => ({ value: o, label: o }))}
              />
            </div>
          </div>
        </Grupo>

        <Grupo titulo="Cómo salió" subtitulo="Qué tan bien ejecutaste lo que habías planeado">
          <div className="grid gap-4 sm:grid-cols-2">
            <Puntuacion
              titulo="Adherencia al plan"
              value={planAdherence}
              onChange={setPlanAdherence}
            />
            <Puntuacion
              titulo="Calidad de entrada"
              value={entryQuality}
              onChange={setEntryQuality}
            />
          </div>
        </Grupo>

        <Grupo titulo="Qué te llevas" subtitulo="Lo que quieres recordar la próxima vez">
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
                    setMistakes((c) =>
                      c.includes(code) ? c.filter((x) => x !== code) : [...c, code],
                    )
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
        </Grupo>

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
          <Button variant="outline" onClick={saveAsTemplate} disabled={isPending || nadaMarcado}>
            Guardar como plantilla
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

/** Un bloque de preguntas con su título, igual que en la ficha de una operación. */
function Grupo({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-foreground">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{subtitulo}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Un desplegable cuya primera opción es «sin cambiar».
 *
 * Ese primer valor es lo que hace que este cuadro no borre nada: dejarlo
 * puesto significa «no toques este campo», no «pon vacío».
 */
function Desplegable({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
    >
      <option value="">Sin cambiar</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Del 1 al 5, con la palabra en el título del botón.
 *
 * El número solo invita a que el criterio se mueva; la palabra hace que el 4
 * de hoy signifique lo mismo que el de hace un mes -- igual que en la ficha de
 * una operación, donde el desplegable lleva las palabras escritas.
 */
function Puntuacion({
  titulo,
  value,
  onChange,
}: {
  titulo: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{titulo}</legend>
      <div className="flex gap-1.5">
        {RATINGS.map((n) => (
          <Chip
            key={n}
            label={String(n)}
            title={RATING_OPTIONS.find((o) => o.value === n)?.label}
            active={value === n}
            onToggle={() => onChange(value === n ? null : n)}
          />
        ))}
      </div>
    </fieldset>
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
