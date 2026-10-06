"use client";

import { FileText, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { leerArchivoProyecto, type ArchivoProyecto } from "@/modules/tasks/domain/project-file";
import { applyProjectImport, planProjectImport, type PlanVisible } from "@/modules/tasks/project-actions";

/**
 * «Importar desde Claude».
 *
 * 1. Eliges el archivo (o lo pegas). El lector corre aquí, en el navegador:
 *    nada sale hasta que lo has visto.
 * 2. El servidor calcula el plan con lo que ya hay y te lo enseña: «Así lo
 *    entendí: crearé…». Nunca borra ni pisa lo que escribiste tú.
 * 3. «Crear» lo hace. Si algo cambió entretanto, no hace nada y te enseña el
 *    plan nuevo.
 *
 * Un archivo `.privado` se rechaza al leerlo, antes de mandar nada.
 */
export function ImportFromClaude() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [nombreArchivo, setNombreArchivo] = useState<string | undefined>(undefined);
  const [archivo, setArchivo] = useState<ArchivoProyecto | null>(null);
  const [plan, setPlan] = useState<PlanVisible | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const reiniciar = () => {
    setArchivo(null);
    setPlan(null);
    setError(null);
  };

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    reiniciar();
    if (/\.privad[oa]\b/i.test(f.name)) {
      setError("Ese es el archivo privado del proyecto: nunca sube a la app. Elige el otro, el que no dice «privado».");
      setTexto("");
      setNombreArchivo(undefined);
      if (input.current) input.current.value = "";
      return;
    }
    if (f.size > 400_000) {
      setError("El archivo es demasiado grande para ser un proyecto.");
      return;
    }
    setNombreArchivo(f.name);
    setTexto(await f.text());
  };

  const leer = () => {
    reiniciar();
    const r = leerArchivoProyecto(texto, { nombreArchivo });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setArchivo(r.archivo);
    start(async () => {
      const respuesta = await planProjectImport(r.archivo);
      if (respuesta.error || !respuesta.plan) setError(respuesta.error ?? "No pude prepararlo.");
      else setPlan(respuesta.plan);
    });
  };

  const crear = () => {
    if (!archivo || !plan) return;
    start(async () => {
      const r = await applyProjectImport(archivo, plan.huella);
      if (r.cambiado && r.plan) {
        setPlan(r.plan);
        toast.message(r.error ?? "Algo cambió: revísalo otra vez.");
        return;
      }
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.success(plan.nuevo ? "Proyecto creado." : "Proyecto al día.");
      if (r.projectId) router.push(`/tareas/proyectos/${r.projectId}`);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Elige el archivo que te dejó Claude en <code className="text-xs">data/proyectos/</code> o pégalo
          aquí. Antes de crear nada te enseño lo que entendí.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={elegir}
            className="sr-only"
            id="archivo-proyecto"
          />
          <Button asChild variant="outline" className="min-h-11">
            <label htmlFor="archivo-proyecto" className="cursor-pointer">
              <FileText aria-hidden /> Elegir archivo
            </label>
          </Button>
          {nombreArchivo ? <span className="text-sm text-muted-foreground">{nombreArchivo}</span> : null}
        </div>
        <Textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setNombreArchivo(undefined);
            reiniciar();
          }}
          rows={8}
          placeholder={"---\nproyecto: …\n---\n## Tareas\n- [ ] …"}
          aria-label="El archivo del proyecto"
          className="font-mono text-xs"
        />
        <Button type="button" onClick={leer} disabled={texto.trim() === "" || pending} className="min-h-11 w-fit">
          {pending && !plan ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Ver qué va a hacer
        </Button>
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-[14px] border border-negative/40 bg-negative/5 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {plan ? <PlanPreview plan={plan} pending={pending} onCrear={crear} onCancelar={reiniciar} /> : null}
    </div>
  );
}

export function PlanPreview({
  plan,
  pending,
  onCrear,
  onCancelar,
}: {
  plan: PlanVisible;
  pending: boolean;
  onCrear: () => void;
  onCancelar: () => void;
}) {
  const [titulo, ...resto] = plan.lineas;
  const nada = plan.operaciones === 0;
  return (
    <section aria-label="Así lo entendí" className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-muted-foreground">Así lo entendí</h2>
      {plan.bloqueo ? (
        <p className="text-sm text-negative">{plan.bloqueo}</p>
      ) : (
        <>
          <p className="text-base font-semibold">{titulo}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {resto.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}

      <Lista titulo="Cambia" items={plan.cambios} />
      <Lista titulo="Se queda como lo pusiste tú" items={plan.seQueda} />
      <Lista titulo="No se borra" items={plan.noSeBorra} />
      <Lista titulo="Avisos" items={plan.avisos} plegada />

      {!plan.bloqueo ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onCrear} disabled={pending || nada} className="min-h-11">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {nada ? "No hay nada que cambiar" : plan.nuevo ? "Crear" : "Aplicar los cambios"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancelar} className="min-h-11">
            Cancelar
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Lista({ titulo, items, plegada = false }: { titulo: string; items: string[]; plegada?: boolean }) {
  if (items.length === 0) return null;
  const cuerpo = (
    <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-muted-foreground">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
  if (plegada) {
    return (
      <details>
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          {titulo} ({items.length})
        </summary>
        {cuerpo}
      </details>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">{titulo}</h3>
      {cuerpo}
    </div>
  );
}
