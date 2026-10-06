"use client";

import { Loader2, Pencil, Plus, UserMinus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SIDES, SIDE_LABELS, displayName } from "@/core/people";
import { PersonAvatar } from "@/core/ui/person-avatar";
import { PROJECT_LIMITS } from "@/modules/tasks/domain/projects";
import { addMember, setMemberActive, updateMember } from "@/modules/tasks/project-actions";
import type { MemberView, PersonRow } from "@/modules/tasks/project-queries";
import type { MemberSide } from "@/types/database";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Quién está en el proyecto, su papel, de qué lado y qué hace.
 *
 * «Qué hace» es lo que pediste: una a tres líneas por persona, y se edita aquí
 * mismo. El enlace con su WhatsApp no se pone desde aquí: lo propondrá el bot
 * y se confirma con un «sí» escrito, porque hay homónimos.
 */
export function ProjectPeople({
  projectId,
  members,
  allPeople,
  ownerId,
}: {
  projectId: string;
  members: MemberView[];
  allPeople: PersonRow[];
  ownerId: string | null;
}) {
  const activos = members.filter((m) => m.active);
  const fuera = members.filter((m) => !m.active);

  return (
    <div className="flex flex-col gap-3">
      {activos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay nadie. Añade a quien está y lo que hace.</p>
      ) : null}
      {activos.map((m) => (
        <Miembro key={m.id} member={m} projectId={projectId} />
      ))}

      <NuevoMiembro projectId={projectId} allPeople={allPeople} members={members} ownerId={ownerId} />

      {fuera.length > 0 ? (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm text-muted-foreground">Ya no están ({fuera.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {fuera.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <PersonAvatar person={m.person} size="sm" /> {displayName(m.person)}
                </span>
                <VolverAMeter memberId={m.id} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function VolverAMeter({ memberId }: { memberId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => void (await setMemberActive(memberId, true)))}
    >
      Volver a meter
    </Button>
  );
}

function Miembro({ member, projectId }: { member: MemberView; projectId: string }) {
  const [editando, setEditando] = useState(false);
  const [pending, start] = useTransition();
  const p = member.person;
  const sinWhatsapp = !p.is_owner && !p.has_whatsapp && p.whatsapp_hint !== "SI";

  const detalle = [
    member.side ? SIDE_LABELS[member.side] : null,
    p.relation,
  ].filter(Boolean);

  const sacar = () =>
    start(async () => {
      const r = await setMemberActive(member.id, false);
      if (r.error) toast.error(r.error);
      else toast.success(`${displayName(p)} ya no está en el proyecto.`);
    });

  return (
    <article className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
      <div className="flex items-start gap-3">
        <PersonAvatar person={p} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/personas/${p.id}` as Route} className="font-medium hover:underline">
              {displayName(p)}
            </Link>
            {member.role ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs">{member.role}</span>
            ) : null}
            {sinWhatsapp ? <span className="text-xs text-muted-foreground">sin WhatsApp</span> : null}
          </div>
          {detalle.length > 0 ? <p className="text-xs text-muted-foreground">{detalle.join(" · ")}</p> : null}
          {member.does_md ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Qué hace: </span>
              {member.does_md}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {member.openTasks === 0
              ? "Sin tareas abiertas"
              : `Le ${member.openTasks === 1 ? "toca 1" : `tocan ${member.openTasks}`}`}
            {member.waitingDays !== null && !p.is_owner ? ` · lo suyo más viejo lleva ${member.waitingDays} días` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => setEditando((e) => !e)} aria-label={`Editar a ${displayName(p)}`}>
            <Pencil aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-11" disabled={pending} onClick={sacar} aria-label={`Sacar a ${displayName(p)} del proyecto`}>
            <UserMinus aria-hidden />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/tareas/proyectos/${projectId}?tab=tareas&para=${p.is_owner ? "YO" : p.id}` as Route}
          className="flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden /> tarea para {p.is_owner ? "ti" : p.name}
        </Link>
        <Link href={`/personas/${p.id}` as Route} className="flex min-h-11 items-center text-muted-foreground hover:text-foreground">
          Ficha
        </Link>
      </div>
      {editando ? <EditarMiembro member={member} onDone={() => setEditando(false)} /> : null}
    </article>
  );
}

function EditarMiembro({ member, onDone }: { member: MemberView; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [role, setRole] = useState(member.role ?? "");
  const [side, setSide] = useState<string>(member.side ?? "");
  const [does, setDoes] = useState(member.does_md ?? "");

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updateMember(member.id, { role, side: side as MemberSide, does_md: does });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Guardado.");
        onDone();
      }
    });
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2 rounded-lg bg-secondary/40 p-2">
      <div className="grid grid-cols-2 gap-2">
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Papel (Socio, Abogada…)" aria-label="Papel" maxLength={PROJECT_LIMITS.memberRole} className="h-11" />
        <select value={side} onChange={(e) => setSide(e.target.value)} aria-label="Lado" className={selectClass}>
          <option value="">Lado…</option>
          {SIDES.map((s) => (
            <option key={s} value={s}>
              {SIDE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <Textarea value={does} onChange={(e) => setDoes(e.target.value)} placeholder="Qué hace en este proyecto" aria-label="Qué hace" maxLength={PROJECT_LIMITS.memberDoes} rows={2} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          Guardar
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * «+ Persona»: busca entre las que ya existen y, si no está, la crea.
 */
function NuevoMiembro({
  projectId,
  allPeople,
  members,
  ownerId,
}: {
  projectId: string;
  allPeople: PersonRow[];
  members: MemberView[];
  ownerId: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, start] = useTransition();
  const [quien, setQuien] = useState("");
  const [nombre, setNombre] = useState("");
  const [role, setRole] = useState("");
  const [side, setSide] = useState("NOSOTROS");
  const [does, setDoes] = useState("");

  const dentro = new Set(members.filter((m) => m.active).map((m) => m.person_id));
  const candidatas = allPeople.filter((p) => !p.is_owner && !dentro.has(p.id) && !p.archived_at);
  const yoDentro = ownerId !== null && dentro.has(ownerId);

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const nueva = quien === "NUEVA" || quien === "";
    if (nueva && nombre.trim() === "") {
      toast.error("Escribe su nombre.");
      return;
    }
    const who: { me: true } | { newName: string } | { personId: string } =
      quien === "YO" ? { me: true } : nueva ? { newName: nombre } : { personId: quien };
    start(async () => {
      const r = await addMember(projectId, who, { role, side: side as MemberSide, does_md: does });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Añadida al proyecto.");
      setAbierto(false);
      setQuien("");
      setNombre("");
      setRole("");
      setDoes("");
    });
  };

  if (!abierto) {
    return (
      <Button type="button" variant="outline" onClick={() => setAbierto(true)} className="min-h-11 w-fit">
        <Plus aria-hidden /> Persona
      </Button>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
      <select value={quien} onChange={(e) => setQuien(e.target.value)} aria-label="Quién" className={selectClass}>
        <option value="">Alguien nuevo…</option>
        {!yoDentro ? <option value="YO">Tú</option> : null}
        {candidatas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.relation ? ` · ${p.relation}` : ""}
          </option>
        ))}
      </select>
      {quien === "" || quien === "NUEVA" ? (
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cómo le dices" aria-label="Nombre" maxLength={80} className="h-11" />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Papel" aria-label="Papel" maxLength={PROJECT_LIMITS.memberRole} className="h-11" />
        <select value={side} onChange={(e) => setSide(e.target.value)} aria-label="Lado" className={selectClass}>
          {SIDES.map((s) => (
            <option key={s} value={s}>
              {SIDE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <Textarea value={does} onChange={(e) => setDoes(e.target.value)} placeholder="Qué hace en este proyecto" aria-label="Qué hace" maxLength={PROJECT_LIMITS.memberDoes} rows={2} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Añadir
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
