import { notFound } from "next/navigation";

import { fetchEntityExtras } from "@/core/entity-extras";
import { DetailShell } from "@/core/ui/detail-shell";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { fetchBooks, fetchSession } from "@/modules/reading/queries";
import { LogReadingForm } from "@/modules/reading/ui/reading-forms";

/**
 * La ficha de una lectura.
 *
 * El resumen -- «qué me llevo» -- es lo que uno relee meses después, y en la
 * lista salía recortado. Aquí sale entero y además se puede corregir.
 */
export default async function ReadingSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const [session, books] = await Promise.all([fetchSession(sessionId), fetchBooks()]);
  if (!session) notFound();

  const [timezone, extras] = await Promise.all([
    userTimezone(),
    fetchEntityExtras("LECTURA", session.id),
  ]);

  const subtitle = [
    formatDate(`${session.session_date}T00:00:00Z`, timezone),
    session.minutes !== null ? `${session.minutes} min` : null,
    session.pages !== null ? `${session.pages} pág.` : null,
    session.score !== null ? `${session.score}/10` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="LECTURA"
      entityId={session.id}
      path={`/lecturas/${session.id}`}
      backHref="/lecturas"
      backLabel="Lecturas"
      title={session.bookTitle ?? "Lectura suelta"}
      subtitle={subtitle}
      colorToken="--mod-reading"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <LogReadingForm date={session.session_date} books={books} session={session} />
    </DetailShell>
  );
}
