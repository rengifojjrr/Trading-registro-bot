"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveMeal, type MealFormState } from "@/modules/meals/actions";
import { MEAL_TYPE_LABELS } from "@/modules/meals/domain/meals";

const initial: MealFormState = { error: null, success: false };

/**
 * Registrar una comida.
 *
 * Los ingredientes se escriben uno por línea, tal cual se dirían: «200 g
 * tomate», «2 huevos», «sal». Se interpretan al guardar, y lo que no encaje
 * queda como nombre suelto en vez de perderse. Ese campo es la razón entera
 * de traerse el planificador desde Notion, donde es un párrafo del que no
 * sale ninguna lista de la compra.
 */
export function MealForm({ date }: { date: string }) {
  const [state, formAction, pending] = useActionState(saveMeal, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      toast.success("Comida registrada.");
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="meal_date" value={date} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Select name="meal_type" defaultValue="ALMUERZO">
          <SelectTrigger aria-label="Tipo de comida">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MEAL_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input name="name" placeholder="¿Qué comiste?" maxLength={200} required className="sm:col-span-2" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ingredients" className="text-sm font-medium">
          Ingredientes
        </label>
        <Textarea
          id="ingredients"
          name="ingredients"
          rows={4}
          placeholder={"Uno por línea:\n200 g tomate\n2 huevos\nsal"}
        />
        <p className="text-xs text-muted-foreground">
          De aquí sale la lista de la compra, así que cuanto más suelto lo escribas, mejor.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="cook" placeholder="Quién cocinó" maxLength={120} />
        <Input name="notes" placeholder="Notas" maxLength={4000} />
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Guardar comida
        </Button>
      </div>
    </form>
  );
}
