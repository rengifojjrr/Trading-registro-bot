"use client";

import { Loader2, Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createHabit, type HabitFormState } from "@/modules/habits/actions";

const initialState: HabitFormState = { error: null, success: false };

/**
 * Añadir un hábito.
 *
 * Que esto exista y sea trivial es la mitad del argumento del módulo: en
 * Notion añadir un hábito significa añadir una columna, y el histórico nunca
 * la tiene. Aquí es una fila más.
 */
export function NewHabit() {
  const [state, formAction, pending] = useActionState(createHabit, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      toast.success("Hábito creado.");
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
      <Input name="emoji" placeholder="🙂" className="w-16 text-center" maxLength={8} aria-label="Emoji" />
      <Input name="name" placeholder="Nuevo hábito" className="w-52" maxLength={60} required />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" aria-hidden />}
        Añadir
      </Button>
    </form>
  );
}
