import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEntityExtras } from "@/core/entity-extras";
import { isUuid } from "@/core/ids";
import { colorVars } from "@/core/notion-colors";
import { CIRCLE_LABELS, SIDE_LABELS, displayName } from "@/core/people";
import { DetailShell } from "@/core/ui/detail-shell";
import { PersonAvatar } from "@/core/ui/person-avatar";
import { cn } from "@/lib/utils";
import { dateIn, daysBetween, dayLabel, PROJECT_STATUS_LABELS } from "@/modules/tasks/domain/projects";
import { fetchPersonFull } from "@/modules/tasks/project-queries";
import { PersonForm } from "@/modules/tasks/ui/projects/person-form";

/**
 * La ficha de una persona: en qué proyectos está, qué hace en cada uno, qué le
 * toca y qué esperas de ella, y tu nota.
 *
 * La ficha larga que arma el bot (quién es, cómo os escribís, qué cuidar) no
 * está aquí: vive en tu Mac, con los mensajes.
 */
export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  if (!isUuid(personId)) notFound();
  const datos = await fetchPersonFull(personId);
  if (!datos) notFound();

  const { person, memberships, tasks, today, timezone } = datos;
  const extras = await fetchEntityExtras("PERSONA", person.id);
  const abiertas = tasks.filter((t) => t.status !== "HECHA");
  const hechas = tasks.length - abiertas.length;
  const sinWhatsapp = !person.is_owner && !person.has_whatsapp && person.whatsapp_hint !== "SI";

  const subtitulo = [
    person.relation,
    person.circle ? CIRCLE_LABELS[person.circle] : null,
    person.is_owner ? null : sinWhatsapp ? (person.whatsapp_hint === "NO" ? "sin WhatsApp" : "WhatsApp sin confirmar") : "WhatsApp",
    person.phone_tail ? `…${person.phone_tail}` : null,
    person.archived_at ? "archivada" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="PERSONA"
      entityId={person.id}
      path={`/personas/${person.id}`}
      backHref="/personas"
      backLabel="Personas"
      title={displayName(person)}
      subtitle={subtitulo || undefined}
      colorToken="--mod-tasks"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <div className="flex items-center gap-3">
        <PersonAvatar person={person} size="lg" />
        <p className="text-sm text-muted-foreground">
          {abiertas.length === 0 ? "No le toca nada ahora." : `Le ${abiertas.length === 1 ? "toca 1 cosa" : `tocan ${abiertas.length} cosas`}`}
          {hechas > 0 ? ` · ${hechas} hechas` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">En tus proyectos</CardTitle>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">En ninguno todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {memberships.map((m) => (
                <li key={m.id} className={cn("text-sm", !m.active && "text-muted-foreground")}>
                  <Link
                    href={`/tareas/proyectos/${m.project.id}?tab=personas` as Route}
                    className="font-medium hover:underline"
                    style={{ ...colorVars(m.project.color), color: "var(--tag-color)" }}
                  >
                    {m.project.icon ? `${m.project.icon} ` : ""}
                    {m.project.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {PROJECT_STATUS_LABELS[m.project.status]}
                    {m.role ? ` · ${m.role}` : ""}
                    {m.side ? ` · ${SIDE_LABELS[m.side]}` : ""}
                    {!m.active ? " · ya no está" : ""}
                  </span>
                  {m.does_md ? <p className="text-foreground/90">{m.does_md}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{person.is_owner ? "Te toca" : "Le toca"}</CardTitle>
        </CardHeader>
        <CardContent>
          {abiertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada abierto.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {abiertas.map((t) => {
                const espera = daysBetween(dateIn(t.created_at, timezone), today);
                const atrasada = t.due_date !== null && t.due_date < today;
                return (
                  <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                    <Link href={`/tareas/${t.id}` as Route} className="min-w-0 flex-1 truncate hover:underline">
                      {t.title}
                    </Link>
                    {t.projectName ? (
                      <span className="hidden shrink-0 text-xs sm:inline" style={{ ...colorVars(t.projectColor), color: "var(--tag-color)" }}>
                        {t.projectName}
                      </span>
                    ) : null}
                    <span className={cn("shrink-0 text-xs tabular-nums", atrasada ? "text-negative" : "text-muted-foreground")}>
                      {t.due_date ? dayLabel(t.due_date, today) : `${espera} d`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lo que sabes</CardTitle>
        </CardHeader>
        <CardContent>
          <PersonForm person={person} />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
