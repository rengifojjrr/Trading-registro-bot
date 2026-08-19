import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import {
  defaultNightToLog,
  formatSleepDuration,
  summarise,
} from "@/modules/sleep/domain/sleep";
import { fetchSleepEntries } from "@/modules/sleep/queries";
import { NightPicker } from "@/modules/sleep/ui/night-picker";
import { SleepWizard } from "@/modules/sleep/ui/sleep-wizard";
import { NotionImportCard } from "@/core/ui/notion-import-card";
import { runSleepFromNotion } from "@/modules/sleep/actions";
import { sleepDatabaseId } from "@/modules/sleep/notion-import";

/**
 * Sueño: registrar.
 *
 * La pantalla principal del módulo es el formulario, no el informe. Es lo
 * único que se abre a diario, y con dos preguntas ya deja un dato que en
 * Notion no existía: la duración como número, no como la etiqueta de texto
 * «8 horas» de una lista de opciones.
 *
 * El historial y el análisis viven en sus propias secciones para que esta
 * quepa entera en la pantalla del móvil a las siete de la mañana.
 */
export default async function SleepPage({
  searchParams,
}: {
  searchParams: Promise<{ noche?: string }>;
}) {
  const timezone = await userTimezone();
  const { noche } = await searchParams;

  const latest = defaultNightToLog(new Date(), timezone);
  const date = isIsoDate(noche) && noche <= todayIn(timezone) ? noche : latest;

  const entries = await fetchSleepEntries();
  const entry = entries.find((e) => e.sleep_date === date) ?? null;

  const last30 = entries.slice(0, 30);
  const stat = summarise(last30.map((e) => ({ durationMinutes: e.duration_minutes, score: e.score })));

  return (
    <>
      <PageHeader
        title="Registrar sueño"
        description="Una pregunta cada vez. Con las dos horas basta; lo demás es de propina."
      />

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <NightPicker date={date} latest={latest} />
          {/* Remontar al cambiar de noche: si no, los atajos de hora y el
              puntaje se quedarían con los de la noche anterior. */}
          <SleepWizard key={date} date={date} entry={entry} timezone={timezone} />
        </CardContent>
      </Card>

      <NotionImportCard
        title="Desde Notion"
        description="Trae las noches de la base «Dormir». Las dos horas de texto («2am», «10am») se vuelven aquí una duración de verdad, que es lo que allí no se podía promediar."
        label="Traer las noches"
        configured={sleepDatabaseId() !== null}
        missingVariable="NOTION_SLEEP_DATABASE_ID"
        onImport={runSleepFromNotion}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          Tu media:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatSleepDuration(stat.averageMinutes)}
          </span>{" "}
          en las últimas {last30.length} noches
        </span>
        <Link href="/sueno/analisis" className="underline underline-offset-4 hover:text-foreground">
          Ver el análisis
        </Link>
        <Link href="/sueno/historial" className="underline underline-offset-4 hover:text-foreground">
          Ver el historial
        </Link>
      </div>
    </>
  );
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
