"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logout } from "@/lib/auth/actions";
import { verifySecondFactor, type EstadoVerificar } from "@/lib/auth/mfa-actions";

const inicial: EstadoVerificar = { error: null };

export function VerifyForm({ next, factores }: { next: string; factores: { id: string; nombre: string }[] }) {
  const [state, formAction, pending] = useActionState(verifySecondFactor, inicial);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">El código de tu teléfono</CardTitle>
        <CardDescription>
          Abre la app de códigos y escribe las seis cifras. Sólo se pide una vez en cada teléfono.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          {factores.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="factorId">Teléfono</Label>
              <select id="factorId" name="factorId" className="h-11 rounded-md border border-input bg-transparent px-2 text-sm">
                {factores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="factorId" value={factores[0]?.id ?? ""} />
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Código</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              autoFocus
              className="h-12 text-center text-lg tracking-[0.4em]"
              aria-invalid={state.error ? true : undefined}
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="min-h-11">
            {pending ? "Comprobando…" : "Entrar"}
          </Button>
        </form>
        <form action={logout} className="mt-3 flex justify-center">
          <button type="submit" className="min-h-11 text-sm text-muted-foreground hover:text-foreground">
            Salir
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          ¿Sin el teléfono? Entra con el otro que inscribiste, o quita el factor desde Supabase (Authentication → Users).
        </p>
      </CardContent>
    </Card>
  );
}
