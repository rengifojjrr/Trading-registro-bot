import { formatClock, parseClockLabel } from "@/lib/notion/clock";
import {
  dateStart,
  findProperty,
  matchOptions,
  multiSelectNames,
  numberValue,
  plainText,
  selectName,
  type NotionProperties,
} from "@/lib/notion/properties";

import { BEFORE_BED, MOOD_ON_WAKING, WOKE_HOW } from "./sleep";

/**
 * Traduce una noche de la base «Dormir» de Notion.
 *
 * Lo que hace esta importación, y que en Notion no se podía hacer, es
 * convertir dos etiquetas de texto -- «2am» y «10am» -- en dos instantes y,
 * de ahí, en una duración que sí se puede promediar. Allí la duración se
 * guardaba aparte, a mano, en una lista de opciones («8 horas», «+8 horas»),
 * que es un dato distinto del que sale de restar las dos horas: uno es lo que
 * recordabas al levantarte y el otro es lo que dice el reloj.
 *
 * Cuando los dos existen y no coinciden, gana el reloj y se avisa. No al
 * revés: la etiqueta «+8 horas» no se puede restar de nada.
 */

export interface NotionMappedNight {
  notion_page_id: string;
  sleep_date: string;
  /** «HH:MM» en la zona del usuario; el llamador los convierte en instantes. */
  bedtime: string | null;
  wake_time: string | null;
  score: number | null;
  before_bed: string[];
  woke_how: string[];
  mood_on_waking: string[];
  dream: string | null;
  notes: string | null;
  place: string | null;
}

export interface NightMappingResult {
  night: NotionMappedNight;
  warnings: string[];
}

/** «8 horas» → 480. Sólo para contrastar, nunca para guardar. */
export function labelledMinutes(labels: string[]): number | null {
  for (const label of labels) {
    const match = label.match(/(\d+)\s*horas?/i);
    if (match) return Number(match[1]) * 60;
  }
  return null;
}

/** Minutos entre dos relojes, cruzando la medianoche si hace falta. */
export function minutesBetweenClocks(bedtime: string, wakeTime: string): number | null {
  const bed = toMinutes(bedtime);
  const wake = toMinutes(wakeTime);
  if (bed === null || wake === null) return null;
  return wake > bed ? wake - bed : wake + 24 * 60 - bed;
}

function toMinutes(clock: string): number | null {
  const match = clock.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function mapNotionNight(page: {
  id: string;
  properties: NotionProperties;
}): NightMappingResult | null {
  const properties = page.properties ?? {};

  // La fecha es la identidad de una noche: sin ella no hay dónde archivarla.
  const sleepDate = dateStart(findProperty(properties, "Dia de dormir"));
  if (!sleepDate) return null;

  const warnings: string[] = [];

  const bedtimeLabel = selectName(findProperty(properties, "A que hora Dormi"));
  const wakeLabel = selectName(findProperty(properties, "Hora de despertar"));

  const bedtime = formatClock(parseClockLabel(bedtimeLabel));
  const wakeTime = formatClock(parseClockLabel(wakeLabel));

  if (bedtimeLabel && !bedtime) warnings.push(`Hora de acostarse ilegible: «${bedtimeLabel}»`);
  if (wakeLabel && !wakeTime) warnings.push(`Hora de levantarse ilegible: «${wakeLabel}»`);

  const beforeBed = matchOptions(multiSelectNames(findProperty(properties, "antes de dormir")), BEFORE_BED);
  const wokeHow = matchOptions(multiSelectNames(findProperty(properties, "Desperté")), WOKE_HOW);
  const mood = matchOptions(
    multiSelectNames(findProperty(properties, "Animo al despertar")),
    MOOD_ON_WAKING,
  );
  for (const dropped of [...beforeBed.dropped, ...wokeHow.dropped, ...mood.dropped]) {
    warnings.push(`Opción desconocida: «${dropped}»`);
  }

  // El contraste entre el reloj y la etiqueta que se apuntó a mano. Media
  // hora de diferencia es redondeo; hora y media es que uno de los dos campos
  // se quedó sin actualizar, y eso conviene saberlo.
  const claimed = labelledMinutes(multiSelectNames(findProperty(properties, "Cuanto tiempo Dormi")));
  if (bedtime && wakeTime && claimed !== null) {
    const measured = minutesBetweenClocks(bedtime, wakeTime);
    if (measured !== null && Math.abs(measured - claimed) > 90) {
      warnings.push(
        `${sleepDate}: el reloj dice ${Math.round(measured / 60)}h y la etiqueta ${Math.round(claimed / 60)}h`,
      );
    }
  }

  const score = numberValue(findProperty(properties, "Puntaje"));

  return {
    night: {
      notion_page_id: page.id,
      sleep_date: sleepDate,
      bedtime,
      wake_time: wakeTime,
      // El puntaje se guarda entero: el formulario ofrece once botones y una
      // media de 7,5 importada haría que ninguno saliera marcado.
      score: score === null ? null : Math.round(score),
      before_bed: beforeBed.kept,
      woke_how: wokeHow.kept,
      mood_on_waking: mood.kept,
      dream: plainText(findProperty(properties, "Sueño")),
      notes: plainText(findProperty(properties, "Notas")),
      place: plainText(findProperty(properties, "Donde")),
    },
    warnings,
  };
}
