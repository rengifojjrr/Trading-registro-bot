import { SurveyButton, SurveyGate } from "@/components/journal/survey-gate";
import { Card, CardContent } from "@/components/ui/card";
import { contestadas } from "@/core/encuesta/pasos";
import { aRespuestas, SURVEY_STEPS, SURVEY_TOTAL } from "@/lib/journal/survey";
import { fetchSurveyCandidate, fetchSurveyForTrade } from "@/lib/journal/survey-queries";

/**
 * Mira si hay una operación recién cerrada por la que preguntar, y pregunta.
 *
 * Va envuelto en un `Suspense` por quien lo monta: el panel de trading no
 * puede esperar a esta consulta para pintar las cifras, que es lo que se
 * viene a ver. Si tarda, aparece después; si falla, no aparece y no se lleva
 * la página por delante -- una encuesta es un extra, y un extra nunca puede
 * romper lo principal.
 */
export async function SurveyLauncher() {
  const trade = await fetchSurveyCandidate().catch((error) => {
    console.error("[encuesta] no se pudo buscar la operación", error);
    return null;
  });

  // El portón se pinta siempre, también sin candidata. Si sólo se pintara
  // cuando la hay, cualquier refresco que dejara de encontrarla lo desmontaría
  // -- y contestar una pregunta hace justo eso, porque la operación pasa a
  // contar como apuntada. Era lo que cerraba la encuesta a mitad.
  return <SurveyGate trade={trade} />;
}

/**
 * La puerta de atrás a la encuesta, en la ficha de la operación.
 *
 * Justo encima del formulario completo, porque es la alternativa a él y no un
 * añadido: quien llega hasta aquí y ve dieciséis campos se va, y ésta es la
 * frase que le ofrece contestar media docena de preguntas en su lugar. Es
 * también lo que hace que descartar la que salió sola no sea definitivo.
 */
export async function SurveyPrompt({ tradeId }: { tradeId: string }) {
  const trade = await fetchSurveyForTrade(tradeId).catch((error) => {
    console.error("[encuesta] no se pudo leer la operación", error);
    return null;
  });

  if (!trade) return null;

  const hechas = contestadas(SURVEY_STEPS, aRespuestas(trade.answers));

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {hechas === 0
              ? "¿Prefieres la versión corta?"
              : hechas >= SURVEY_TOTAL
                ? "La encuesta está contestada"
                : `Dejaste la encuesta a medias`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hechas === 0
              ? `${SURVEY_TOTAL} preguntas, una a una, todas saltables. Escribe en los mismos campos de aquí abajo.`
              : `${hechas} de ${SURVEY_TOTAL} respondidas. Puedes seguir donde lo dejaste o cambiar lo que pusiste.`}
          </p>
        </div>
        <SurveyButton trade={trade} />
      </CardContent>
    </Card>
  );
}
