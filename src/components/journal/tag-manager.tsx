"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { createTag, deleteTag, renameTag, type TagFormState } from "@/app/(dashboard)/journal/tag-actions";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface ManagedTag {
  id: string;
  name: string;
  /** How many trades currently carry this tag -- deleting removes it from all of them. */
  usageCount: number;
}

const initialState: TagFormState = { error: null, success: false };

/**
 * Create / rename / delete for tags. They were filterable and used for
 * setup grades, but there was nowhere in the app to manage them -- a tag
 * could only ever come into existence by writing to the database directly.
 */
export function TagManager({ tags }: { tags: ManagedTag[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [createState, createAction, creating] = useActionState(createTag, initialState);

  useEffect(() => {
    if (createState.success) toast.success("Etiqueta creada.");
    if (createState.error) toast.error(createState.error);
  }, [createState]);

  function handleDelete(tag: ManagedTag) {
    startTransition(async () => {
      const result = await deleteTag(tag.id);
      if (result.error) toast.error(result.error);
      else toast.success("Etiqueta borrada.");
      setConfirmingId(null);
    });
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <CollapsibleSection
          title="Etiquetas"
          subtitle={tags.length === 0 ? "Ninguna todavía" : `${tags.length} en total`}
        >
          <div className="flex flex-col gap-4">
            {/* Keyed on the success flag so a successful create clears the input. */}
            <form key={String(createState.success)} action={createAction} className="flex gap-2">
              <Input name="name" placeholder="Nueva etiqueta" maxLength={60} autoComplete="off" required />
              <Button type="submit" size="sm" variant="outline" disabled={creating}>
                <Plus className="size-4" aria-hidden />
                {creating ? "Creando…" : "Añadir"}
              </Button>
            </form>

            {tags.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {tags.map((tag) => (
                  <li key={tag.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    {editingId === tag.id ? (
                      <RenameTagForm tag={tag} onDone={() => setEditingId(null)} />
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <span>{tag.name}</span>
                          <Badge variant="outline">
                            {tag.usageCount === 1 ? "1 operación" : `${tag.usageCount} operaciones`}
                          </Badge>
                        </div>

                        {confirmingId === tag.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-warning">
                              {tag.usageCount > 0
                                ? `Se quitará de ${tag.usageCount} operación(es). ¿Seguro?`
                                : "¿Seguro?"}
                            </span>
                            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => handleDelete(tag)}>
                              <Check className="size-4 text-negative" aria-hidden />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                              <X className="size-4" aria-hidden />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Renombrar ${tag.name}`}
                              onClick={() => setEditingId(tag.id)}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Borrar ${tag.name}`}
                              onClick={() => setConfirmingId(tag.id)}
                            >
                              <Trash2 className="size-4 text-negative" aria-hidden />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}

function RenameTagForm({ tag, onDone }: { tag: ManagedTag; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(renameTag, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success("Etiqueta renombrada.");
      onDone();
    }
    if (state.error) toast.error(state.error);
    // onDone is stable enough here (a setState updater from the parent);
    // including it would re-run this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex w-full gap-2">
      <input type="hidden" name="id" value={tag.id} />
      <Input name="name" defaultValue={tag.name} maxLength={60} autoComplete="off" required className="max-w-xs" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
        Cancelar
      </Button>
    </form>
  );
}
