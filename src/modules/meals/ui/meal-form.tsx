"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IconPicker } from "@/core/ui/icon-picker";
import { saveMeal, updateMeal, type MealFormState } from "@/modules/meals/actions";
import { MEAL_TYPE_LABELS, type MealType } from "@/modules/meals/domain/meals";
import type { MealRow } from "@/modules/meals/queries";

const initial: MealFormState = { error: null, success: false };

/**
 * Registrar una comida.
 *
 * Los ingredientes se escriben uno por línea, tal cual se dirían: «200 g
 * tomate», «2 huevos», «sal». Se interpretan al guardar, y lo que no encaje
 * queda como nombre suelto en vez de perderse. Ese campo es la razón entera
 * de traerse el planificador desde Notion, donde es un párrafo del que no
 * sale ninguna lista de la compra.
 *
 * El mismo formulario crea y edita. Antes sólo creaba, así que un ingrediente
 * mal escrito se arreglaba borrando la comida entera y tecleando los otros
 * seis otra vez.
 */
export function MealForm({
  date,
  defaultType = "ALMUERZO",
  meal,
}: {
  date: string;
  defaultType?: MealType;
  meal?: MealRow;
}) {
  const editing = meal !== undefined;
  const [state, formAction, pending] = useActionState(editing ? updateMeal : saveMeal, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      if (!editing) formRef.current?.reset();
      toast.success(editing ? "Comida guardada." : "Comida registrada.");
    }
    if (state.error) toast.error(state.error);
  }, [state, editing]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {editing ? <input type="hidden" name="id" value={meal.id} /> : null}
      {/* La fecha es un campo y no un valor oculto: esto es un planificador,
          y planificar es escribir el martes que viene, no sólo hoy. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          type="date"
          name="meal_date"
          defaultValue={meal?.meal_date ?? date}
          aria-label="Día de la comida"
          className="tabular-nums"
          required
        />
        <Select name="meal_type" defaultValue={meal?.meal_type ?? defaultType}>
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
        <Input
          name="name"
          placeholder="¿Qué se come?"
          defaultValue={meal?.name ?? ""}
          maxLength={200}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ingredients" className="text-sm font-medium">
          Ingredientes
        </label>
        <Textarea
          id="ingredients"
          name="ingredients"
          rows={4}
          defaultValue={(meal?.ingredients ?? [])
            .map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" "))
            .join("\n")}
          placeholder={"Uno por línea:\n200 g tomate\n2 huevos\nsal"}
        />
        <p className="text-xs text-muted-foreground">
          De aquí sale la lista de la compra, así que cuanto más suelto lo escribas, mejor.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="cook"
          placeholder="Quién cocinó"
          defaultValue={meal?.cook ?? ""}
          maxLength={120}
        />
        <Input
          name="notes"
          placeholder="Notas"
          defaultValue={meal?.notes ?? ""}
          maxLength={4000}
        />
      </div>

      <IconPicker name="icon" defaultValue={meal?.icon} />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {editing ? "Guardar cambios" : "Guardar comida"}
        </Button>
      </div>
    </form>
  );
}
