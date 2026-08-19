import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEntityExtras } from "@/core/entity-extras";
import { DetailShell } from "@/core/ui/detail-shell";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { MEAL_TYPE_LABELS } from "@/modules/meals/domain/meals";
import { fetchMeal } from "@/modules/meals/queries";
import { MealForm } from "@/modules/meals/ui/meal-form";

/**
 * La ficha de una comida.
 *
 * Aquí es donde por fin se puede corregir: antes guardar sólo creaba, y un
 * ingrediente mal escrito obligaba a borrar la comida entera y teclear los
 * otros seis otra vez.
 */
export default async function MealDetailPage({
  params,
}: {
  params: Promise<{ mealId: string }>;
}) {
  const { mealId } = await params;

  const meal = await fetchMeal(mealId);
  if (!meal) notFound();

  const [timezone, extras] = await Promise.all([
    userTimezone(),
    fetchEntityExtras("COMIDA", meal.id),
  ]);

  const subtitle = [
    MEAL_TYPE_LABELS[meal.meal_type],
    formatDate(`${meal.meal_date}T00:00:00Z`, timezone),
    meal.cook ? `cocinó ${meal.cook}` : null,
    meal.ingredients.length > 0
      ? `${meal.ingredients.length} ${meal.ingredients.length === 1 ? "ingrediente" : "ingredientes"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="COMIDA"
      entityId={meal.id}
      path={`/comidas/${meal.id}`}
      backHref="/comidas"
      backLabel="Comidas"
      icon={meal.icon}
      title={meal.name}
      subtitle={subtitle}
      colorToken="--mod-meals"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">La comida</CardTitle>
        </CardHeader>
        <CardContent>
          <MealForm date={meal.meal_date} meal={meal} />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
