"use client";

import { Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { colorVars } from "@/core/notion-colors";
import { CIRCLE_LABELS, displayName, normalizeName } from "@/core/people";
import { PersonAvatar } from "@/core/ui/person-avatar";
import { cn } from "@/lib/utils";
import { createPerson } from "@/modules/tasks/project-actions";
import type { PersonListItem } from "@/modules/tasks/project-queries";

/**
 * Personas: la gente de tus proyectos, con buscador.
 *
 * Se agrupa por proyecto o por círculo. Quien te debe algo lleva «esperando N
 * días». Sólo están las que metiste en algo: nunca tu agenda de contactos.
 */
export function PeopleList({ people }: { people: PersonListItem[] }) {
  const [q, setQ] = useState("");
  const [agrupar, setAgrupar] = useState<"PROYECTO" | "CIRCULO">("PROYECTO");
  const [verArchivadas, setVerArchivadas] = useState(false);

  const filtradas = useMemo(() => {
    const n = normalizeName(q);
    return people
      .filter((p) => verArchivadas || !p.archived_at)
      .filter((p) => n === "" || normalizeName(`${p.name} ${p.aliases.join(" ")} ${p.relation ?? ""}`).includes(n));
  }, [people, q, verArchivadas]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { titulo: string; items: PersonListItem[] }>();
    const meter = (k: string, titulo: string, p: PersonListItem) => {
      const g = mapa.get(k) ?? { titulo, items: [] };
      if (!g.items.includes(p)) g.items.push(p);
      mapa.set(k, g);
    };
    for (const p of filtradas) {
      if (agrupar === "CIRCULO") meter(p.circle ?? "~", p.circle ? CIRCLE_LABELS[p.circle] : "Sin círculo", p);
      else if (p.projects.length === 0) meter("~", "En ningún proyecto", p);
      else for (const pr of p.projects) meter(pr.id, pr.name, p);
    }
    return [...mapa.entries()]
      .sort(([a, ga], [b, gb]) => Number(a === "~") - Number(b === "~") || ga.titulo.localeCompare(gb.titulo, "es"))
      .map(([k, g]) => ({ key: k, ...g }));
  }, [filtradas, agrupar]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar personas" className="h-11 pl-9" />
        </label>
        <div role="group" aria-label="Agrupar" className="flex gap-1.5">
          {(["PROYECTO", "CIRCULO"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={agrupar === a}
              onClick={() => setAgrupar(a)}
              className={cn(
                "min-h-11 rounded-full border px-3 text-sm",
                agrupar === a ? "border-primary bg-accent font-medium text-primary" : "border-border text-muted-foreground",
              )}
            >
              Por {a === "PROYECTO" ? "proyecto" : "círculo"}
            </button>
          ))}
        </div>
      </div>

      <NuevaPersona />

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {people.length === 0 ? "Aún no hay nadie. Las personas entran al meterlas en un proyecto." : "Nadie con ese nombre."}
        </p>
      ) : null}

      {grupos.map((g) => (
        <section key={g.key} className="flex flex-col gap-1.5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {g.titulo} · {g.items.length}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-[14px] border border-border bg-card">
            {g.items.map((p) => (
              <li key={p.id}>
                <Link href={`/personas/${p.id}` as Route} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-secondary/40">
                  <PersonAvatar person={p} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate text-sm font-medium", p.archived_at && "text-muted-foreground")}>
                      {displayName(p)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        p.relation,
                        agrupar === "CIRCULO" ? p.projects.map((x) => x.name).join(", ") : p.projects.find((x) => x.id === g.key)?.role,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </div>
                  <span className="flex shrink-0 flex-col items-end text-xs text-muted-foreground">
                    {p.openTasks > 0 ? <span>le toca {p.openTasks}</span> : null}
                    {p.waitingDays !== null && !p.is_owner ? (
                      <span className={p.waitingDays > 7 ? "text-warning" : undefined}>esperando {p.waitingDays} d</span>
                    ) : null}
                  </span>
                  {agrupar === "CIRCULO" && p.projects[0] ? (
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ ...colorVars(p.projects[0].color), backgroundColor: "var(--tag-color)" }} />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {people.some((p) => p.archived_at) ? (
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={verArchivadas} onChange={(e) => setVerArchivadas(e.target.checked)} className="size-4" />
          Ver archivadas
        </label>
      ) : null}
    </div>
  );
}

function NuevaPersona() {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [relacion, setRelacion] = useState("");
  const [pending, start] = useTransition();

  if (!abierta) {
    return (
      <Button type="button" variant="outline" onClick={() => setAbierta(true)} className="min-h-11 w-fit">
        <Plus aria-hidden /> Persona
      </Button>
    );
  }

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await createPerson({ name: nombre, relation: relacion });
      if (r.error || !r.id) {
        toast.error(r.error ?? "No se pudo crear.");
        return;
      }
      toast.success("Persona creada.");
      router.push(`/personas/${r.id}`);
    });
  };

  return (
    <form onSubmit={crear} className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cómo le dices" aria-label="Nombre" maxLength={80} required className="h-11" autoFocus />
      <Input value={relacion} onChange={(e) => setRelacion(e.target.value)} placeholder="Quién es (opcional): socia de la empresa…" aria-label="Quién es" maxLength={120} className="h-11" />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Crear
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierta(false)} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
