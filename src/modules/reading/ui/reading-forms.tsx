"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { ChipGroup } from "@/core/ui/chip-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IconPicker } from "@/core/ui/icon-picker";
import {
  createBook,
  logReadingSession,
  updateBook,
  updateReadingSession,
  type ReadingFormState,
} from "@/modules/reading/actions";
import { BOOK_STATUS_LABELS, GENRES } from "@/modules/reading/domain/reading";
import type { BookRow, SessionRow } from "@/modules/reading/queries";

const initial: ReadingFormState = { error: null, success: false };

/**
 * Registrar una lectura.
 *
 * Minutos y páginas son campos numéricos separados, que es justo lo que no
 * ocurre en Notion: allí «Cuánto tiempo leí» acabó guardando géneros y
 * «Cuántas hojas» tiene como única opción «40 minutos». Se pide al menos uno
 * de los dos, porque una sesión sin ninguno no dice nada.
 *
 * El mismo formulario registra y corrige. Antes sólo registraba, así que unos
 * minutos mal contados no se arreglaban de ninguna forma.
 */
export function LogReadingForm({
  date,
  books,
  session,
}: {
  date: string;
  books: BookRow[];
  session?: SessionRow;
}) {
  const editing = session !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updateReadingSession : logReadingSession,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      if (!editing) formRef.current?.reset();
      toast.success(editing ? "Lectura guardada." : "Lectura registrada.");
    }
    if (state.error) toast.error(state.error);
  }, [state, editing]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? "La lectura" : "Acabo de leer"}</CardTitle>
        <CardDescription>Los minutos y las páginas van por separado -- con uno de los dos basta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          {editing ? <input type="hidden" name="id" value={session.id} /> : null}
          {editing ? (
            <Labelled label="Día" htmlFor="session_date">
              <Input
                id="session_date"
                name="session_date"
                type="date"
                defaultValue={session.session_date}
                required
              />
            </Labelled>
          ) : (
            <input type="hidden" name="session_date" value={date} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Libro" htmlFor="book_id">
              <Select name="book_id" defaultValue={session?.book_id ?? ""}>
                <SelectTrigger id="book_id">
                  <SelectValue placeholder="Sin libro concreto" />
                </SelectTrigger>
                <SelectContent>
                  {books.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.icon ? `${b.icon} ` : ""}
                      {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>
            <Labelled label="Empecé a las" htmlFor="started_at">
              <Input
                id="started_at"
                name="started_at"
                type="time"
                defaultValue={session?.started_at ?? ""}
              />
            </Labelled>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Labelled label="Minutos" htmlFor="minutes">
              <Input
                id="minutes"
                name="minutes"
                type="number"
                min={0}
                max={1440}
                inputMode="numeric"
                defaultValue={session?.minutes ?? ""}
              />
            </Labelled>
            <Labelled label="Páginas" htmlFor="pages">
              <Input
                id="pages"
                name="pages"
                type="number"
                min={0}
                max={5000}
                inputMode="numeric"
                defaultValue={session?.pages ?? ""}
              />
            </Labelled>
            <Labelled label="Puntaje (0-10)" htmlFor="score">
              <Input
                id="score"
                name="score"
                type="number"
                min={0}
                max={10}
                step="0.5"
                inputMode="decimal"
                defaultValue={session?.score ?? ""}
              />
            </Labelled>
          </div>

          <Labelled label="Qué me llevo" htmlFor="summary">
            <Textarea
              id="summary"
              name="summary"
              rows={editing ? 8 : 3}
              defaultValue={session?.summary ?? ""}
              placeholder="Una idea, una frase, lo que sea."
            />
          </Labelled>

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editing ? "Guardar cambios" : "Guardar lectura"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Alta de libro. El género es del libro, no de la sesión -- ahí es donde
 * debía estar.
 *
 * Siempre visible en lugar de detrás de un botón: esconderlo obligaría a
 * cerrarlo desde un efecto al guardar, y limpiar el formulario es más simple
 * y además deja añadir varios libros seguidos.
 *
 * También edita, con el mismo formulario: es el que ya sabe qué campos tiene
 * un libro, y escribir otro para corregir el autor sería copiarlo entero.
 */
export function NewBookForm({ book }: { book?: BookRow }) {
  const editing = book !== undefined;
  const [state, formAction, pending] = useActionState(editing ? updateBook : createBook, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      if (!editing) formRef.current?.reset();
      toast.success(editing ? "Libro guardado." : "Libro añadido.");
    }
    if (state.error) toast.error(state.error);
  }, [state, editing]);

  return (
    <form ref={formRef} action={formAction} className="flex w-full flex-col gap-3 rounded-lg border border-border p-3">
      {editing ? <input type="hidden" name="id" value={book.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="title"
          placeholder="Título"
          defaultValue={book?.title ?? ""}
          maxLength={200}
          required
        />
        <Input
          name="author"
          placeholder="Autor"
          defaultValue={book?.author ?? ""}
          maxLength={120}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="total_pages"
          type="number"
          min={1}
          defaultValue={book?.total_pages ?? ""}
          placeholder="Páginas totales (opcional)"
        />
        <Select name="status" defaultValue={book?.status ?? "LEYENDO"}>
          <SelectTrigger aria-label="Estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BOOK_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ChipGroup name="genres" options={GENRES} defaultValue={book?.genres ?? []} accent="--mod-reading" />
      <IconPicker name="icon" defaultValue={book?.icon} />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {editing ? "Guardar cambios" : "Añadir libro"}
        </Button>
      </div>
    </form>
  );
}

function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
