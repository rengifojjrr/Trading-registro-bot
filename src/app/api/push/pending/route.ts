import { NextResponse } from "next/server";

import { fetchNowReminders } from "@/core/reminders/queries";
import { hhmm } from "@/core/reminders/rule";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { userForApi } from "@/lib/auth/require-user";
import { DateTime } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";
import {
  AVISO_PRIVADO,
  comoVaAviso,
  queFaltaAviso,
  tuDiaAviso,
  type Aviso,
} from "@/modules/tasks/domain/live-reminders";
import { progressLabel } from "@/modules/tasks/domain/projects";
import { fetchProjectFull, fetchProjectsOverview } from "@/modules/tasks/project-queries";
import { fetchTasks } from "@/modules/tasks/queries";
import type { ReminderEntityKind, ReminderKind } from "@/types/database";

/**
 * Qué avisar, en el momento de avisar.
 *
 * El push llega sin contenido y el service worker pregunta aquí qué enseñar.
 * Parece un rodeo y no lo es: un push con el contenido dentro puede llegar
 * veinte minutos tarde y decir algo que ya no es cierto -- «la sincronización
 * falló» cuando la siguiente ya fue bien --. Preguntando al despertar, lo que
 * se enseña es lo que hay.
 *
 * Primero, los recordatorios que acaban de sonar y siguen sin hacer: cada uno
 * con su texto (o, si es «vivo», armado ahora: qué falta, cómo va, tu día) y
 * los botones «Hecho» y «En 1 h». Con «ocultar en la pantalla bloqueada», sólo
 * «Tienes un recordatorio». Si no hay ninguno, el aviso de siempre.
 */

/** Cuánto vale un disparo para el push: lo de hace más se ve en la app, no aquí. */
const VENTANA_MS = 15 * 60 * 1000;

interface AvisoDeRecordatorio extends Aviso {
  tag: string;
  href: string;
  recordatorio: { id: string; fireAt: string };
  acciones: { action: "hecho" | "posponer"; title: string }[];
}

export async function GET() {
  const user = await userForApi();
  if (!user) return NextResponse.json({ hay: false }, { status: 401 });
  const supabase = await createClient();

  const avisos = await recordatoriosQueSonaron(user.id, supabase).catch(() => [] as AvisoDeRecordatorio[]);
  if (avisos.length > 0) {
    return NextResponse.json({ hay: true, title: avisos[0].title, body: avisos[0].body, avisos });
  }

  const { data, count } = await supabase
    .from("notifications")
    .select("title, message, severity, href", { count: "exact" })
    .eq("user_id", user.id)
    .eq("is_read", false)
    .is("resolved_at", null)
    // Los de los recordatorios van arriba, con sus botones; aquí sólo el resto.
    .neq("type", "RECORDATORIO")
    .order("created_at", { ascending: false })
    .limit(1);

  const ultima = data?.[0];

  if (!ultima || !count) {
    // Ya se leyó desde otro sitio: se dice que no hay nada y el service
    // worker no enseña nada, en vez de sacar un aviso vacío.
    return NextResponse.json({ hay: false });
  }

  return NextResponse.json({
    hay: true,
    title: ultima.title,
    // Con más de uno pendiente, decirlo: «tres cosas» y «una cosa» son
    // situaciones distintas y el aviso sólo cabe una vez.
    body: count > 1 ? `${ultima.message} (y ${count - 1} aviso(s) más)` : ultima.message,
    severity: ultima.severity,
    href: ultima.href ?? "/activity",
  });
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function recordatoriosQueSonaron(userId: string, supabase: Supabase): Promise<AvisoDeRecordatorio[]> {
  const { data: disparos } = await supabase
    .from("core_reminder_fires")
    .select("reminder_id, fire_at")
    .eq("user_id", userId)
    .eq("missed", false)
    .is("done_at", null)
    .is("snoozed_to", null)
    .gte("pushed_at", new Date(Date.now() - VENTANA_MS).toISOString())
    .order("fire_at", { ascending: false })
    .limit(3);
  if (!disparos || disparos.length === 0) return [];

  const ids = [...new Set(disparos.map((d) => d.reminder_id))];
  const { data: recordatorios } = await supabase
    .from("core_reminders")
    .select("id, text, kind, entity_kind, entity_id, lock_private, tz")
    .eq("user_id", userId)
    .in("id", ids);
  const porId = new Map((recordatorios ?? []).map((r) => [r.id, r]));
  const timezone = await userTimezone();

  const out: AvisoDeRecordatorio[] = [];
  for (const d of disparos) {
    const r = porId.get(d.reminder_id);
    if (!r) continue;
    const aviso = await textoDe(supabase, userId, r, d.fire_at, timezone).catch(() => AVISO_PRIVADO);
    out.push({
      ...aviso,
      tag: `rem-${r.id}-${Math.floor(Date.parse(d.fire_at) / 1000)}`,
      href: `/tareas/recordatorios?r=${r.id}`,
      recordatorio: { id: r.id, fireAt: d.fire_at },
      acciones: [
        { action: "hecho", title: "Hecho" },
        { action: "posponer", title: "En 1 h" },
      ],
    });
  }
  return out;
}

async function textoDe(
  supabase: Supabase,
  userId: string,
  r: {
    id: string;
    text: string | null;
    kind: ReminderKind;
    entity_kind: ReminderEntityKind | null;
    entity_id: string | null;
    lock_private: boolean;
    tz: string;
  },
  fireAt: string,
  timezone: string,
): Promise<Aviso> {
  if (r.lock_private) return AVISO_PRIVADO;
  const hora = hhmm(DateTime.fromISO(fireAt).setZone(r.tz).toFormat("HH:mm"));

  if ((r.kind === "QUE_FALTA" || r.kind === "COMO_VA") && r.entity_kind === "PROYECTO" && r.entity_id) {
    const datos = await fetchProjectFull(r.entity_id);
    if (!datos) return { title: "Recordatorio", body: "El proyecto ya no está." };
    // Un proyecto que no es «completo» no enseña su contenido en la pantalla bloqueada.
    if (datos.project.cloud_level !== "COMPLETA") return AVISO_PRIVADO;
    if (r.kind === "QUE_FALTA") {
      const nombres = Object.fromEntries(datos.allPeople.map((p) => [p.id, p.name]));
      return queFaltaAviso(datos.project.name, datos.tasks, datos.ownerId, nombres, datos.today);
    }
    const siguiente = datos.computed.next[0];
    return comoVaAviso(
      datos.project.name,
      {
        health: datos.computed.health,
        next: siguiente ? { title: siguiente.title, date: siguiente.date } : null,
        overdue: datos.computed.overdue,
        open: datos.computed.open,
        progressLabel: datos.computed.progress.total > 0 ? progressLabel(datos.computed.progress) : null,
      },
      datos.today,
    );
  }

  if (r.kind === "TU_DIA") {
    const today = todayIn(timezone);
    const [tareas, ahora, proyectos] = await Promise.all([fetchTasks(), fetchNowReminders(), fetchProjectsOverview()]);
    const mias = tareas.filter((t) => t.mine && t.parent_id === null && t.status !== "HECHA");
    const paraHoy = mias.filter((t) => t.due_date === today);
    const atrasadas = mias.filter((t) => t.due_date !== null && t.due_date < today);
    return tuDiaAviso({
      paraHoy: paraHoy.length,
      atrasadas: atrasadas.length,
      recordatorios: ahora.items.filter(
        (i) => i.estado === "PENDIENTE" && i.reminder.id !== r.id && Date.parse(i.fireAt) > Date.now(),
      ).length,
      proyectos: proyectos.cards
        .filter((c) => c.project.is_active && c.project.cloud_level === "COMPLETA")
        .map((c) => ({ name: c.project.name, level: c.computed.health.level })),
      primera: atrasadas[0]?.title ?? paraHoy[0]?.title ?? null,
    });
  }

  // De texto: el texto de título, y la hora y a qué va atado debajo.
  let atado: string | null = null;
  if (r.entity_kind === "PROYECTO" && r.entity_id) {
    const { data: p } = await supabase
      .from("tasks_projects")
      .select("name, cloud_level")
      .eq("id", r.entity_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (p && p.cloud_level !== "COMPLETA") return AVISO_PRIVADO;
    atado = p?.name ?? null;
  } else if (r.entity_kind === "TAREA" && r.entity_id) {
    const { data: t } = await supabase.from("tasks_items").select("title").eq("id", r.entity_id).eq("user_id", userId).maybeSingle();
    atado = t?.title ?? null;
  } else if (r.entity_kind === "PERSONA" && r.entity_id) {
    const { data: pe } = await supabase.from("core_people").select("name").eq("id", r.entity_id).eq("user_id", userId).maybeSingle();
    atado = pe?.name ?? null;
  }
  return {
    title: (r.text ?? "").trim() || "Recordatorio",
    body: [hora, atado].filter(Boolean).join(" · "),
  };
}
