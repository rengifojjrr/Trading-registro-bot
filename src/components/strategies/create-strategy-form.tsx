"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { createStrategy, type StrategyFormState } from "@/app/(dashboard)/strategies/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: StrategyFormState = { error: null, success: false };

export function CreateStrategyForm() {
  const [state, formAction, pending] = useActionState(createStrategy, initialState);
  const [isOpen, setIsOpen] = useState(false);

  // Deliberately stays open after a successful create (the form clears
  // itself via the key below) so adding several strategies in a row
  // doesn't mean reopening it each time. The toast plus the strategy
  // appearing in the list behind is the confirmation.
  useEffect(() => {
    if (state.success) toast.success("Estrategia creada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  if (!isOpen) {
    return (
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Nueva estrategia
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        {/* Keyed on the success flag so a successful create remounts the
            form with empty fields, rather than leaving the just-saved name
            sitting in an uncontrolled input. */}
        <form key={String(state.success)} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="strategy-name">Nombre</Label>
            <Input
              id="strategy-name"
              name="name"
              required
              maxLength={120}
              autoComplete="off"
              placeholder="p. ej. Ruptura de rango en Londres"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="strategy-description">Reglas (opcional)</Label>
            <Textarea
              id="strategy-description"
              name="description"
              rows={3}
              maxLength={2000}
              autoComplete="off"
              placeholder="Cuándo entras, dónde pones el stop, cuándo sales."
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Creando…" : "Crear estrategia"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
