"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { toggleMistake } from "@/app/(dashboard)/trades/[tradeId]/behaviour-actions";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { InfoHint } from "@/components/shared/info-hint";
import { MISTAKE_CODES, MISTAKE_META, type MistakeCode } from "@/lib/journal/mistakes";
import { cn } from "@/lib/utils";

const GROUP_ORDER = ["ENTRADA", "GESTIÓN", "SALIDA", "DISCIPLINA"] as const;

/**
 * Tick what went wrong, from a fixed list.
 *
 * A closed vocabulary is less expressive than free text and far more
 * useful: it's what lets the Comportamiento page rank mistakes by what they
 * actually cost. The description under each label exists so the same trade
 * gets the same tag next month -- otherwise the counts drift as the
 * definitions do.
 */
export function MistakeTagger({
  tradeId,
  initialCodes,
}: {
  tradeId: string;
  initialCodes: MistakeCode[];
}) {
  const [active, setActive] = useState<Set<MistakeCode>>(new Set(initialCodes));
  const [isPending, startTransition] = useTransition();

  function toggle(code: MistakeCode) {
    const next = !active.has(code);
    // Optimistic: ticking a box that waits for a round-trip feels broken,
    // and the server call is idempotent so a failure can simply revert.
    setActive((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(code);
      else updated.delete(code);
      return updated;
    });

    startTransition(async () => {
      const result = await toggleMistake(tradeId, code, next);
      if (result.error) {
        toast.error(result.error);
        setActive((prev) => {
          const reverted = new Set(prev);
          if (next) reverted.delete(code);
          else reverted.add(code);
          return reverted;
        });
      }
    });
  }

  return (
    <CollapsibleSection
      title="¿Qué salió mal?"
      subtitle="Etiquetas fijas, para poder contarlas después"
      badge={active.size > 0 ? String(active.size) : undefined}
      defaultOpen={active.size > 0}
    >
      <div className="flex flex-col gap-3">
        {GROUP_ORDER.map((group) => {
          const codes = MISTAKE_CODES.filter((c) => MISTAKE_META[c].group === group);
          return (
            <div key={group} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {codes.map((code) => {
                  const isActive = active.has(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={isPending}
                      aria-pressed={isActive}
                      onClick={() => toggle(code)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
                        isActive
                          ? "border-negative/50 bg-negative/15 text-negative"
                          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {MISTAKE_META[code].label}
                    </button>
                  );
                })}
                <InfoHint label={group}>
                  {codes.map((c) => `${MISTAKE_META[c].label}: ${MISTAKE_META[c].description}`).join(" · ")}
                </InfoHint>
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
