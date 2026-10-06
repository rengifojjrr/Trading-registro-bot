"use client";

import { Copy, KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { crearLlavePuente, revocarLlavePuente } from "@/lib/puente/llaves-actions";

/**
 * Las llaves del puente con el bot, en Ajustes.
 *
 * Una por cliente: el bot en la Mac (`mac-1`), el bot en un servidor
 * (`vps-1`) y Claude Code en la Mac (`claude-1`). Se pueden tener dos vivas a
 * la vez para rotar sin cortar: creas la nueva, la pones en la Mac, y revocas
 * la vieja. La llave se ve una sola vez, al crearla.
 */

export interface LlaveEnAjustes {
  id: string;
  cliente: string;
  creadaEn: string;
  usadaEn: string | null;
  revocadaEn: string | null;
  vale: boolean;
}

const CLIENTES = [
  { id: "mac-1", nombre: "El bot en tu Mac", variable: "PUENTE_SECRET" },
  { id: "claude-1", nombre: "Claude Code en tu Mac", variable: "PUENTE_CLAUDE_SECRET" },
  { id: "vps-1", nombre: "El bot en un servidor", variable: "PUENTE_SECRET" },
] as const;

function fecha(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PuenteLlaves({ llaves }: { llaves: LlaveEnAjustes[] }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [nueva, setNueva] = useState<{ cliente: string; llave: string } | null>(null);

  const crear = (cliente: string) =>
    empezar(async () => {
      const r = await crearLlavePuente(cliente);
      if (r.error || !r.llave) {
        toast.error(r.error ?? "No se pudo crear.");
        return;
      }
      setNueva({ cliente, llave: r.llave });
      router.refresh();
    });

  const revocar = (id: string, nombre: string) => {
    if (!window.confirm(`¿Revocar esta llave de «${nombre}»? Lo que la use deja de poder hablar con la app al momento.`)) return;
    empezar(async () => {
      const r = await revocarLlavePuente(id);
      if (r.error) toast.error(r.error);
      else toast.success("Revocada.");
      router.refresh();
    });
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiada.");
    } catch {
      toast.error("No se pudo copiar: selecciónala a mano.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {nueva ? (
        <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium text-foreground">Cópiala ahora: no se vuelve a enseñar.</p>
          <p className="text-muted-foreground">
            En la Mac, en el archivo <code>.env</code> del agente:{" "}
            <code>{CLIENTES.find((c) => c.id === nueva.cliente)?.variable}=…</code>. Después, reinicia el bot (o vuelve a correr el
            script).
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">{nueva.llave}</code>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => copiar(nueva.llave)}>
              <Copy className="size-4" aria-hidden /> Copiar
            </Button>
          </div>
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setNueva(null)}>
            Ya la guardé
          </Button>
        </div>
      ) : null}

      {CLIENTES.map((c) => {
        const suyas = llaves.filter((l) => l.cliente === c.id && !l.revocadaEn);
        return (
          <div key={c.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                {c.nombre}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={pendiente || suyas.length >= 2}
                onClick={() => crear(c.id)}
              >
                {pendiente ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {suyas.length === 0 ? "Crear llave" : "Crear otra (para rotar)"}
              </Button>
            </div>
            {suyas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin llave: no puede hablar con la app.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {suyas.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Creada {fecha(l.creadaEn)} · usada {fecha(l.usadaEn)}
                      {l.vale ? "" : " · ya no vale (cambió la clave del servidor): crea otra"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 text-negative"
                      disabled={pendiente}
                      onClick={() => revocar(l.id, c.nombre)}
                    >
                      Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
