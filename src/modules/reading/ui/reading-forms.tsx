"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { ChipGroup } from "@/core/ui/chip-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconPicker } from "@/core/ui/icon-picker";
import { createBook, updateBook, type ReadingFormState } from "@/modules/reading/actions";
import { BOOK_STATUS_LABELS, GENRES } from "@/modules/reading/domain/reading";
import type { BookRow } from "@/modules/reading/queries";

const initial: ReadingFormState = { error: null, success: false };

/**
 * Alta de libro. El género es del libro, no de la sesión -- ahí es donde
 * debía estar.
 *
 * Sigue siendo un formulario y no una encuesta, al contrario que el rato de
 * lectura: apuntar un libro se hace cinco veces al año, de una sentada y con
 * el libro delante, así que cinco campos a la vista no cansan a nadie. La
 * encuesta es para lo que se contesta a diario, y vive en `reading-survey.tsx`.
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
