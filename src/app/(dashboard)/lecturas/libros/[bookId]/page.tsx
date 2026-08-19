import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEntityExtras } from "@/core/entity-extras";
import { DetailShell } from "@/core/ui/detail-shell";
import { BOOK_STATUS_LABELS } from "@/modules/reading/domain/reading";
import { fetchBook } from "@/modules/reading/queries";
import { NewBookForm } from "@/modules/reading/ui/reading-forms";

/**
 * La ficha de un libro.
 *
 * El avance va en el subtítulo y no en una barra: «120 de 300 páginas» dice
 * lo mismo que la barra y además dice cuánto queda, que es la pregunta.
 */
export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  const book = await fetchBook(bookId);
  if (!book) notFound();

  const extras = await fetchEntityExtras("LIBRO", book.id);

  const subtitle = [
    book.author,
    BOOK_STATUS_LABELS[book.status],
    book.total_pages
      ? `${book.pagesRead} de ${book.total_pages} páginas`
      : book.pagesRead > 0
        ? `${book.pagesRead} páginas leídas`
        : null,
    ...book.genres,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="LIBRO"
      entityId={book.id}
      path={`/lecturas/libros/${book.id}`}
      backHref="/lecturas/libros"
      backLabel="Libros"
      icon={book.icon}
      title={book.title}
      subtitle={subtitle}
      colorToken="--mod-reading"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">El libro</CardTitle>
        </CardHeader>
        <CardContent>
          <NewBookForm book={book} />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
