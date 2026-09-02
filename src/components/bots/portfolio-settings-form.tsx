"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { savePortfolioSettings, type SettingsFormState } from "@/app/(dashboard)/bots/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PortfolioSettings } from "@/lib/bots/types";

const initialState: SettingsFormState = { error: null, success: false };

/**
 * Los umbrales del portfolio.
 *
 * Los de fábrica son los del método. Se pueden cambiar, pero cambiarlos es
 * una decisión de la revisión anual, y el formulario lo dice: no está
 * escondido, está avisado.
 */
export function PortfolioSettingsForm({ settings }: { settings: PortfolioSettings }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(savePortfolioSettings, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success("Umbrales guardados.");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Es el único sitio donde se cambian las reglas del juego, y el método dice que se hace una vez al año, en
        enero. Un umbral que se mueve cuando un bot lo roza no es un umbral.
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Bloques (suman 100)</legend>
        <div className="grid grid-cols-3 gap-3">
          <Num id="targetConvexo" label="Convexo %" value={settings.targets.CONVEXO} />
          <Num id="targetConcavo" label="Cóncavo %" value={settings.targets.CONCAVO} />
          <Num id="targetHibrido" label="Híbrido %" value={settings.targets.HIBRIDO} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Escalera de emergencia (% de drawdown)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num id="ksAlert" label="Alerta" value={settings.killSwitch.alert} />
          <Num id="ksReduce" label="Reducir al 50%" value={settings.killSwitch.reduce} />
          <Num id="ksClose" label="Cerrar posiciones" value={settings.killSwitch.close} />
          <Num id="ksOff" label="Apagón" value={settings.killSwitch.off} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Puertas del pipeline</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Num id="gateProfitFactor" label="PF mínimo" value={settings.gates.profitFactor} step={0.05} />
          <Num id="gateExpectancyR" label="Expectativa R" value={settings.gates.expectancyR} step={0.01} />
          <Num id="gateSharpe" label="Sharpe" value={settings.gates.sharpe} step={0.1} />
          <Num id="gateMaxDrawdownPct" label="DD máx. %" value={settings.gates.maxDrawdownPct} />
          <Num id="gateMinTrades" label="Operaciones" value={settings.gates.minTrades} step={1} />
        </div>
      </fieldset>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar umbrales"}
        </Button>
      </div>
    </form>
  );
}

function Num({ id, label, value, step = 0.5 }: { id: string; label: string; value: number; step?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} name={id} type="number" step={step} defaultValue={value} required />
    </div>
  );
}
