"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Template } from "@/core/templates";
import { IconPicker } from "@/core/ui/icon-picker";
import { TemplateBar } from "@/core/ui/template-bar";
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
  templates,
}: {
  date: string;
  defaultType?: MealType;
  meal?: MealRow;
  /** Sin plantillas, la barra no se pinta: un módulo puede vivir sin ellas. */
  templates?: Template[];
}) {
  const editing = meal !== undefined;
  const [state, formAction, pending] = useActionState(editing ? updateMeal : saveMeal, initial);


  useEffect(() => {
    if (state.success) toast.success(editing ? "Comida guardada." : "Comida registrada.");
    if (state.error) toast.error(state.error);
  }, [state, editing]);

  return (
    <FormFields
      // Al guardar una comida nueva, el formulario se vacía volviendo a
      // montarse. Es lo que `form.reset()` hacía con los campos sin control, y
      // evita escribir estado desde un efecto para conseguir lo mismo.
      key={meal ? meal.id : (state.savedAt ?? 0)}
      {...{ date, defaultType, meal, templates, formAction, pending, editing }}
    />
  );
}

function FormFields({
  date,
  defaultType,
  meal,
  templates,
  formAction,
  pending,
  editing,
}: {
  date: string;
  defaultType: MealType;
  meal?: MealRow;
  templates?: Template[];
  formAction: (formData: FormData) => void;
  pending: boolean;
  editing: boolean;
}) {
  const [type, setType] = useState<MealType>(meal?.meal_type ?? defaultType);
  const [name, setName] = useState(meal?.name ?? "");
  const [ingredients, setIngredients] = useState(
    (meal?.ingredients ?? [])
      .map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" "))
      .join("\n"),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Se come lo mismo muchas veces: el desayuno de casi todos los días no
          debería costar lo mismo que uno nuevo. El mecanismo de plantillas
          existía desde hace tiempo y sólo lo usaba Contenido -- otra pieza
          construida para todos y enchufada en un sitio. */}
      {templates ? (
        <TemplateBar
          moduleId="meals"
          templates={templates}
          colorToken="--mod-meals"
          onApply={(template) => {
            const p = template.payload;
            if (typeof p.name === "string") setName(p.name);
            if (typeof p.meal_type === "string") setType(p.meal_type as MealType);
            // El cuerpo de la plantilla son los ingredientes: es lo que de
            // verdad se repite y lo que más cuesta volver a teclear.
            if (template.body) setIngredients(template.body);
          }}
          currentValues={() => ({
            payload: { name, meal_type: type },
            body: ingredients || null,
          })}
        />
      ) : null}

      {meal ? <input type="hidden" name="id" value={meal.id} /> : null}
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
        <Select name="meal_type" value={type} onValueChange={(v) => setType(v as MealType)}>
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
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
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
