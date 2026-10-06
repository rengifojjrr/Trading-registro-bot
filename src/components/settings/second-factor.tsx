"use client";

import { Copy, Loader2, ShieldCheck, Smartphone, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelTotpEnrollment,
  confirmTotpEnrollment,
  removeTotpFactor,
  startTotpEnrollment,
  type Inscripcion,
} from "@/lib/auth/mfa-actions";

/**
 * El segundo factor en Ajustes: inscribir un teléfono, ver los inscritos y
 * quitarlos.
 *
 * Inscribir son tres pasos en la misma tarjeta: el QR, el primer código y
 * listo. Hasta que no se confirma el código no cuenta: un QR escaneado a
 * medias no deja a nadie fuera.
 */
export function SecondFactor({
  factores,
}: {
  factores: { id: string; nombre: string; desde: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inscripcion, setInscripcion] = useState<Inscripcion | null>(null);
  const [codigo, setCodigo] = useState("");

  const empezar = () =>
    start(async () => {
      const r = await startTotpEnrollment();
      if (r.error) toast.error(r.error);
      else setInscripcion(r);
    });

  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inscripcion?.factorId) return;
    start(async () => {
      const r = await confirmTotpEnrollment(inscripcion.factorId as string, codigo);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Listo: este teléfono ya no te lo pedirá; uno nuevo, una vez.");
      setInscripcion(null);
      setCodigo("");
      router.refresh();
    });
  };

  const cancelar = () => {
    const id = inscripcion?.factorId ?? null;
    setInscripcion(null);
    setCodigo("");
    if (id) {
      start(async () => {
        await cancelTotpEnrollment(id);
      });
    }
  };

  const quitar = (id: string, nombre: string) => {
    const ultimo = factores.length === 1;
    if (
      !window.confirm(
        ultimo
          ? `¿Quitar «${nombre}»? Es el único: la cuenta dejará de pedir código.`
          : `¿Quitar «${nombre}»?`,
      )
    )
      return;
    start(async () => {
      const r = await removeTotpFactor(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Quitado.");
        router.refresh();
      }
    });
  };

  const copiar = async () => {
    if (!inscripcion?.secreto) return;
    try {
      await navigator.clipboard.writeText(inscripcion.secreto);
      toast.success("Copiado.");
    } catch {
      toast.error("No pude copiarlo.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {factores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ahora entras sólo con la contraseña. Con esto, un teléfono nuevo te pedirá además un código de seis cifras
          de una app (Google Authenticator, 1Password, Authy…), una sola vez.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {factores.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
              <ShieldCheck className="size-4 text-positive" aria-hidden />
              <span className="flex-1">
                {f.nombre} <span className="text-xs text-muted-foreground">· desde {f.desde}</span>
              </span>
              <Button type="button" variant="ghost" size="icon" className="size-11" disabled={pending} onClick={() => quitar(f.id, f.nombre)} aria-label={`Quitar ${f.nombre}`}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {inscripcion?.qr ? (
        <form onSubmit={confirmar} className="flex flex-col gap-3 rounded-[14px] border border-border p-4">
          <p className="text-sm">1. Llévalo a la app de códigos.</p>
          {inscripcion.uri ? (
            <div className="flex flex-col gap-1">
              <Button asChild className="min-h-11 w-fit">
                <a href={inscripcion.uri}>
                  <Smartphone aria-hidden /> Abrir en la app de códigos
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">Si la app de códigos está en este mismo teléfono.</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">Si está en otro aparato, escanea esto con él:</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- es un SVG en data: que no pasa por el optimizador */}
          <img src={inscripcion.qr} alt="Código QR para la app de códigos" width={176} height={176} className="rounded-md bg-white p-2" />
          {inscripcion.secreto ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Si no puedes escanear, escribe esta clave:
              <code className="break-all rounded bg-secondary px-1.5 py-0.5 text-foreground">{inscripcion.secreto}</code>
              <Button type="button" variant="ghost" size="sm" onClick={copiar} className="min-h-11">
                <Copy aria-hidden /> Copiar
              </Button>
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            2. Escribe el código que te sale ahora.
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              className="h-12 max-w-40 text-center text-lg tracking-[0.3em]"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="min-h-11">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Confirmar
            </Button>
            <Button type="button" variant="ghost" onClick={cancelar} className="min-h-11">
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant={factores.length === 0 ? "default" : "outline"} onClick={empezar} disabled={pending} className="min-h-11 w-fit">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Smartphone aria-hidden />}
          {factores.length === 0 ? "Activar con mi teléfono" : "Añadir otro teléfono"}
        </Button>
      )}
      {factores.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          Consejo: añade un segundo teléfono o guarda la clave en tu gestor de contraseñas, por si pierdes éste.
        </p>
      ) : null}
    </div>
  );
}
