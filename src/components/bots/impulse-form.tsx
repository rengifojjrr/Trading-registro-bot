"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { logImpulse, type ImpulseFormState } from "@/app/(dashboard)/bots/actions";
import { NativeSelect } from "@/components/bots/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IMPULSE_ACTIONS, IMPULSE_EVALUATION_DAYS, IMPULSE_LABELS } from "@/lib/bots/types";

const initialState: ImpulseFormState = { error: null, success: false };

/**
 * Apuntar el impulso antes de hacerle caso.
 *
 * Tres campos y ya: si apuntarlo cuesta más que ceder, no se apunta. La
 * evaluación llega sola a los siete días.
 */
export function ImpulseForm({ bots, defaultBotId }: { bots: { id: string; name: string }[]; defaultBotId?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(logImpulse, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success("Impulso apuntado.", {
        description: `Se evalúa en ${IMPULSE_EVALUATION_DAYS} días. Hasta entonces, no se toca.`,
      });
      router.refresh();
    }
  }, [state, router]);

  return (
    <form key={String(state.success)} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="impulse-action">Qué te pide el cuerpo</Label>
          <NativeSelect id="impulse-action" name="action" defaultValue="APAGAR">
            {IMPULSE_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {IMPULSE_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="impulse-bot">Sobre qué bot</Label>
          <NativeSelect id="impulse-bot" name="botId" defaultValue={defaultBotId ?? ""}>
            <option value="">La cuenta entera</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="impulse-note">Qué estabas viendo</Label>
        <Textarea
          id="impulse-note"
          name="note"
          rows={2}
          maxLength={1000}
          placeholder="p. ej. Tres pérdidas seguidas y el mercado en noticias. Quería apagarlo hasta el lunes."
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="executed" className="size-4 accent-primary" />
        Al final lo hice
      </label>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Apuntando…" : "Apuntar el impulso"}
        </Button>
      </div>
    </form>
  );
}
