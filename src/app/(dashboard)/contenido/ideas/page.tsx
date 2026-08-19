import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import {
  DIFFICULTY_LABELS,
  STATUS_LABELS,
  type Difficulty,
} from "@/modules/content/domain/content";
import { fetchPieces } from "@/modules/content/queries";
import { ContentBoard } from "@/modules/content/ui/content-board";
import { PieceForm } from "@/modules/content/ui/piece-form";

/** Los dos estados que la vista «Ideas» de Notion filtra. */
const IDEA_STATUSES = ["IDEA", "FALTA_GUION"] as const;

/**
 * Contenido: ideas.
 *
 * La misma vista «Ideas» del calendario: lo que existe pero todavía no tiene
 * guion. Está separada del tablero porque son dos momentos distintos --
 * apuntar una idea es un impulso de treinta segundos, y decidir cuál grabar
 * es una sesión aparte -- y mezclarlos hace que ninguna de las dos ocurra.
 *
 * La dificultad de grabar se enseña aquí y no en el tablero porque es
 * exactamente el dato con el que se elige: entre dos ideas parecidas, se
 * graba la fácil.
 */
export default async function ContentIdeasPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const pieces = await fetchPieces();

  const ideas = pieces.filter((p) => (IDEA_STATUSES as readonly string[]).includes(p.status));
  const byDifficulty = (level: Difficulty) =>
    ideas.filter((p) => p.record_difficulty === level).length;

  return (
    <>
      <PageHeader
        title="Ideas"
        description="Lo que existe pero todavía no tiene guion. Entre dos parecidas, se graba la fácil."
      />

      <Card>
        <CardHeader>
          <CardTitle>Apuntar una idea</CardTitle>
          <CardDescription>Con el título basta. Nace como idea y ya se moverá.</CardDescription>
        </CardHeader>
        <CardContent>
          <PieceForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">
              {ideas.length} {ideas.length === 1 ? "idea" : "ideas"} esperando
            </CardTitle>
            <CardDescription>
              {STATUS_LABELS.IDEA} y {STATUS_LABELS.FALTA_GUION}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((level) => (
              <Badge key={level} variant="outline" className="tabular-nums">
                {DIFFICULTY_LABELS[level]} · {byDifficulty(level)}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ContentBoard pieces={ideas} today={today} statuses={IDEA_STATUSES} />
        </CardContent>
      </Card>
    </>
  );
}
