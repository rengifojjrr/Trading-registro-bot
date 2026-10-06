"use client";

import { Archive, Loader2, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CIRCLES, CIRCLE_LABELS, PERSON_NAME_MAX, PERSON_NOTE_MAX, PERSON_RELATION_MAX } from "@/core/people";
import { setPersonArchived, updatePerson } from "@/modules/tasks/project-actions";
import type { PersonRow } from "@/modules/tasks/project-queries";
import type { PersonCircle } from "@/types/database";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Lo que sabes de una persona, editable: cómo le dices, otros nombres, quién
 * es, su círculo, si tiene WhatsApp y tu nota corta.
 *
 * Del teléfono sólo se guardan las cuatro últimas cifras, si las pones: el
 * número entero nunca sube.
 */
export function PersonForm({ person }: { person: PersonRow }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(person.name);
  const [aliases, setAliases] = useState(person.aliases.join(", "));
  const [relation, setRelation] = useState(person.relation ?? "");
  const [org, setOrg] = useState(person.org ?? "");
  const [circle, setCircle] = useState<string>(person.circle ?? "");
  const [hint, setHint] = useState<string>(person.whatsapp_hint ?? "");
  const [tail, setTail] = useState(person.phone_tail ?? "");
  const [note, setNote] = useState(person.note ?? "");

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updatePerson(person.id, {
        ...(person.is_owner ? {} : { name }),
        aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
        relation,
        org,
        circle: circle as PersonCircle,
        whatsapp_hint: hint as "SI",
        phone_tail: tail,
        note,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      // Al renombrar, el nombre de antes pasa a «Otros nombres»: se enseña ya
      // y no se pierde al guardar otra vez.
      if (r.aliases) setAliases(r.aliases.join(", "));
      toast.success("Guardado.");
    });
  };

  const archivar = () =>
    start(async () => {
      const r = await setPersonArchived(person.id, !person.archived_at);
      if (r.error) toast.error(r.error);
      else toast.success(person.archived_at ? "Vuelve a estar en las listas." : "Archivada: ya no sale en las listas.");
    });

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3">
      {!person.is_owner ? (
        <Campo label="Cómo le dices">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={PERSON_NAME_MAX} required className="h-11" />
        </Campo>
      ) : null}
      <Campo label="Otros nombres (separados por comas)">
        <Input value={aliases} onChange={(e) => setAliases(e.target.value)} className="h-11" />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Quién es">
          <Input value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={PERSON_RELATION_MAX} placeholder="p. ej. socia de la empresa" className="h-11" />
        </Campo>
        <Campo label="Empresa o sitio">
          <Input value={org} onChange={(e) => setOrg(e.target.value)} maxLength={120} className="h-11" />
        </Campo>
        <Campo label="Círculo">
          <select value={circle} onChange={(e) => setCircle(e.target.value)} className={selectClass}>
            <option value="">Sin círculo</option>
            {CIRCLES.map((c) => (
              <option key={c} value={c}>
                {CIRCLE_LABELS[c]}
              </option>
            ))}
          </select>
        </Campo>
        {!person.is_owner ? (
          <Campo label="¿Tiene WhatsApp?">
            <select value={hint} onChange={(e) => setHint(e.target.value)} className={selectClass}>
              <option value="">No lo sé</option>
              <option value="SI">Sí</option>
              <option value="NO">No</option>
            </select>
          </Campo>
        ) : null}
        {!person.is_owner ? (
          <Campo label="Cuatro últimas cifras del teléfono (opcional)">
            <Input
              value={tail}
              onChange={(e) => setTail(e.target.value.replace(/\D/g, "").slice(-4))}
              inputMode="numeric"
              maxLength={4}
              className="h-11"
            />
          </Campo>
        ) : null}
      </div>
      <Campo label="Tu nota">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={PERSON_NOTE_MAX} rows={3} />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Guardar
        </Button>
        {!person.is_owner ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={archivar} className="min-h-11">
            {person.archived_at ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}
            {person.archived_at ? "Volver a las listas" : "Archivar"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Una etiqueta gris y su campo. El campo va en el color del texto: si heredaba
 * el gris de la etiqueta, lo escrito y el ejemplo se veían iguales y una
 * persona sin datos parecía tenerlos.
 */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-foreground">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
