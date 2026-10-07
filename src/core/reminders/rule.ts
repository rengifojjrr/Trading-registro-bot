import { z } from "zod";

import { DateTime } from "@/lib/fecha";
import type { ReminderChannel, ReminderFreq, ReminderKind } from "@/types/database";

/**
 * La regla de un recordatorio, tal y como la guarda la base.
 *
 * Aquí sólo se traduce: palabras a regla (el lector de frases) y regla a
 * palabras («Todos los días · 08:00»). **Cuándo** suena lo calcula la base y
 * nadie más (`recordatorio_siguiente`, en la migración de los recordatorios):
 * la vista previa, el calendario y el reloj llaman a la misma función, y así
 * no pueden discrepar.
 */
export interface ReminderRule {
  freq: ReminderFreq;
  /** «HH:MM», en la zona del recordatorio. */
  atTime: string;
  /** 1 = lunes … 7 = domingo. Sólo SEMANAL. */
  days: number[];
  /** -1 = el último día del mes. Sólo MENSUAL. */
  monthday: number | null;
  /** Sólo CADA_N_DIAS. */
  everyN: number | null;
  /** UNA_VEZ: el día. CADA_N_DIAS: desde cuándo se cuenta. */
  onDate: string | null;
  untilDate: string | null;
}

export const REMINDER_TEXT_MAX = 200;

export const FREQ_LABELS: Record<ReminderFreq, string> = {
  UNA_VEZ: "Una vez",
  DIARIO: "Cada día",
  LABORABLES: "Entre semana",
  SEMANAL: "Cada semana",
  MENSUAL: "Cada mes",
  CADA_N_DIAS: "Cada N días",
};

export const KIND_LABELS: Record<ReminderKind, string> = {
  TEXTO: "Texto",
  QUE_FALTA: "Qué falta en un proyecto",
  COMO_VA: "Cómo va un proyecto",
  TU_DIA: "Tu día",
};

export const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  PUSH: "En el teléfono",
  WHATSAPP: "Copia en «🤖 Mi bot»",
};

/** L M X J V S D, como en el calendario de la aplicación. */
export const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"] as const;
const WEEKDAY_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"] as const;

/** La noche, en la que no suena nada salvo que la hora la pusieras tú. */
export function isNightTime(atTime: string): boolean {
  const [h] = atTime.split(":").map(Number);
  return h >= 22 || h < 7;
}

/**
 * ¿Respeta la noche? Sí, salvo que la hora la dijeras tú y caiga de noche:
 * «recuérdame a las 23:00…» suena a las 23:00.
 */
export function quietFor(atTime: string, timeSaid: boolean): boolean {
  return !(timeSaid && isNightTime(atTime));
}

/** «08:00:00» o «8:00» → «08:00». */
export function hhmm(time: string): string {
  const [h = "0", m = "0"] = time.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function listaY(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * La regla en palabras, para la lista: «Todos los días · 08:00», «Los lunes y
 * jueves · 09:00», «El último día de cada mes · 18:00», «Mié 15 oct · 10:00».
 */
export function describeRule(rule: ReminderRule, today?: string): string {
  const hora = hhmm(rule.atTime);
  let cuando: string;
  switch (rule.freq) {
    case "DIARIO":
      cuando = "Todos los días";
      break;
    case "LABORABLES":
      cuando = "Entre semana";
      break;
    case "SEMANAL": {
      const dias = [...rule.days].sort((a, b) => a - b);
      if (dias.length === 7) cuando = "Todos los días";
      else if (dias.length === 2 && dias[0] === 6 && dias[1] === 7) cuando = "Los fines de semana";
      else cuando = `Los ${listaY(dias.map((d) => WEEKDAY_PLURAL[d - 1] ?? "?"))}`;
      break;
    }
    case "MENSUAL":
      cuando =
        rule.monthday === -1
          ? "El último día de cada mes"
          : `El ${rule.monthday ?? "?"} de cada mes`;
      break;
    case "CADA_N_DIAS":
      cuando =
        rule.everyN === 1
          ? "Todos los días"
          : rule.everyN !== null && rule.everyN % 7 === 0
            ? rule.everyN === 7
              ? "Cada semana"
              : `Cada ${rule.everyN / 7} semanas`
            : `Cada ${rule.everyN ?? "?"} días`;
      break;
    case "UNA_VEZ":
      cuando = rule.onDate ? dateWords(rule.onDate, today) : "Una vez";
      break;
  }
  const hasta = rule.untilDate && rule.freq !== "UNA_VEZ" ? ` · hasta el ${dateWords(rule.untilDate, today)}` : "";
  return `${cuando} · ${hora}${hasta}`;
}

/** «hoy», «mañana», «jue 9 oct», «15 oct 2027». */
export function dateWords(date: string, today?: string): string {
  const d = DateTime.fromISO(date);
  if (!d.isValid) return date;
  if (today) {
    const diff = Math.round(d.diff(DateTime.fromISO(today), "days").days);
    if (diff === 0) return "hoy";
    if (diff === 1) return "mañana";
    const mismoAño = today.slice(0, 4) === date.slice(0, 4);
    return d.toFormat(mismoAño ? "ccc d LLL" : "d LLL yyyy").replace(/\./g, "");
  }
  return d.toFormat("ccc d LLL").replace(/\./g, "");
}

/** Lo que manda el formulario y la orden rápida, validado en los dos lados. */
export const reminderInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(["TEXTO", "QUE_FALTA", "COMO_VA", "TU_DIA"]),
    text: z.string().trim().max(REMINDER_TEXT_MAX, `Máximo ${REMINDER_TEXT_MAX} caracteres.`).optional().default(""),
    freq: z.enum(["UNA_VEZ", "DIARIO", "LABORABLES", "SEMANAL", "MENSUAL", "CADA_N_DIAS"]),
    atTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pon una hora como 08:00."),
    days: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    monthday: z.number().int().min(-1).max(31).refine((n) => n !== 0).nullable().default(null),
    everyN: z.number().int().min(1).max(365).nullable().default(null),
    onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    untilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    entityKind: z.enum(["PROYECTO", "TAREA", "PERSONA"]).nullable().default(null),
    entityId: z.string().uuid().nullable().default(null),
    channels: z.array(z.enum(["PUSH", "WHATSAPP"])).min(1).max(2).default(["PUSH", "WHATSAPP"]),
    lockPrivate: z.boolean().default(false),
    /** La hora la puso él: si cae de noche, suena igual. */
    timeSaid: z.boolean().default(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    const falta = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.kind === "TEXTO" && v.text.trim() === "") falta("text", "Escribe qué te recuerdo.");
    if ((v.kind === "QUE_FALTA" || v.kind === "COMO_VA") && (v.entityKind !== "PROYECTO" || !v.entityId)) {
      falta("entityId", "Elige el proyecto.");
    }
    if ((v.entityKind === null) !== (v.entityId === null)) falta("entityId", "Elige a qué va atado.");
    if (v.freq === "UNA_VEZ" && !v.onDate) falta("onDate", "Elige el día.");
    if (v.freq === "SEMANAL" && v.days.length === 0) falta("days", "Elige al menos un día.");
    if (v.freq === "MENSUAL" && v.monthday === null) falta("monthday", "Elige el día del mes.");
    if (v.freq === "CADA_N_DIAS" && (v.everyN === null || !v.onDate)) falta("everyN", "Cada cuántos días.");
    if (v.untilDate && v.onDate && v.untilDate < v.onDate) falta("untilDate", "«Hasta» va después de «desde».");
  });

export type ReminderInput = z.infer<typeof reminderInputSchema>;

/** La regla de la base (`08:00:00`, `days` como números) en la forma de aquí. */
export function ruleOf(row: {
  freq: ReminderFreq;
  at_time: string;
  days: number[];
  monthday: number | null;
  every_n: number | null;
  on_date: string | null;
  until_date: string | null;
}): ReminderRule {
  return {
    freq: row.freq,
    atTime: hhmm(row.at_time),
    days: row.days ?? [],
    monthday: row.monthday,
    everyN: row.every_n,
    onDate: row.on_date,
    untilDate: row.until_date,
  };
}

/** El texto de un recordatorio en una lista: el suyo o, si es vivo, qué es. */
export function reminderTitle(r: { kind: ReminderKind; text: string | null; entityLabel: string | null }): string {
  if (r.kind === "QUE_FALTA") return `Qué falta en ${r.entityLabel ?? "el proyecto"}`;
  if (r.kind === "COMO_VA") return `Cómo va ${r.entityLabel ?? "el proyecto"}`;
  if (r.kind === "TU_DIA") return "Tu día";
  return r.text ?? "Recordatorio";
}
