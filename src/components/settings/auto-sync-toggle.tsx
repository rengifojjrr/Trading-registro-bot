"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { setAutoSyncEnabled } from "@/app/(dashboard)/validation/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * The auto-sync switch. Rendered outside the settings <form> on purpose:
 * it saves immediately through its own action rather than waiting for
 * "Guardar cambios", because turning syncing on/off is a decision on its
 * own, not a field you might be halfway through editing.
 *
 * The disabled state is a convenience -- the server action re-checks the
 * validation gate regardless of what the client sends.
 */
export function AutoSyncToggle({
  enabled,
  canEnable,
  blockedReason,
}: {
  enabled: boolean;
  canEnable: boolean;
  blockedReason: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    startTransition(async () => {
      const result = await setAutoSyncEnabled(next);
      if (result.error) toast.error(result.error);
      else toast.success(next ? "Sincronización automática activada." : "Sincronización automática desactivada.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sincronización automática</CardTitle>
        <CardDescription>
          Cuando está activa, tus operaciones se importan solas cada pocos minutos. Mientras esté apagada, solo
          se actualizan cuando pulsas &quot;Sincronizar ahora&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 sm:max-w-sm">
          <Label htmlFor="auto_sync_toggle">Importar automáticamente</Label>
          <Switch
            id="auto_sync_toggle"
            checked={enabled}
            disabled={isPending || (!enabled && !canEnable)}
            onCheckedChange={handleChange}
          />
        </div>

        {!enabled && !canEnable ? (
          <p className="text-xs text-muted-foreground">
            {blockedReason}{" "}
            <Link href="/validation" className="text-primary hover:underline">
              Ir a la validación
            </Link>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
