"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateSettings, type SettingsState } from "./actions";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type AppSettingsRow = {
  timezone: string;
  active_venue: "FCM" | "INTX";
  sync_interval_minutes: number;
  reconciliation_hour_local: number;
  notion_enabled: boolean;
  auto_sync_enabled: boolean;
  maintenance_margin_rate: number;
  target_margin_ratio: number;
  trading_fee_pct: number;
  min_fee_per_contract: number;
};

const initialState: SettingsState = { error: null, success: false };

export function SettingsForm({ settings }: { settings: AppSettingsRow }) {
  const [state, formAction, pending] = useActionState(updateSettings, initialState);

  useEffect(() => {
    if (state.success) toast.success("Configuración guardada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Zona horaria y sincronización</CardTitle>
          <CardDescription>
            Todas las fechas se guardan internamente en UTC y se muestran en esta zona.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">Zona horaria</Label>
            <TimezoneSelect name="timezone" defaultValue={settings.timezone} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sync_interval_minutes">Intervalo de sincronización (min)</Label>
            <Input
              id="sync_interval_minutes"
              name="sync_interval_minutes"
              type="number"
              min={1}
              max={60}
              defaultValue={settings.sync_interval_minutes}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reconciliation_hour_local">
              Hora local de conciliación nocturna
            </Label>
            <Input
              id="reconciliation_hour_local"
              name="reconciliation_hour_local"
              type="number"
              min={0}
              max={23}
              defaultValue={settings.reconciliation_hour_local}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Producto de Coinbase</CardTitle>
          <CardDescription>
            CFM (futuros regulados en EE. UU.) es la vía recomendada. INTX (perpetuos
            internacionales) se retira el 9 de septiembre de 2026 según Coinbase -- su
            adaptador queda marcado como experimental.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="active_venue">Venue activo</Label>
            <Select name="active_venue" defaultValue={settings.active_venue}>
              <SelectTrigger id="active_venue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FCM">CFM -- futuros EE. UU. (recomendado)</SelectItem>
                <SelectItem value="INTX">INTX -- perpetuos internacionales (experimental)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parámetros de riesgo y margen</CardTitle>
          <CardDescription>
            Usados por la calculadora de riesgo (menú &quot;Riesgo&quot;). Coinbase no expone un endpoint
            de maintenance margin, así que ese valor y el margen ratio objetivo son tuyos -- cópialos de tu
            cuenta de Coinbase antes de operar, pueden cambiar. El initial margin (día/noche) y el funding sí
            se leen en vivo de Coinbase y no se configuran aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maintenance_margin_rate">Maintenance Margin Rate (%)</Label>
            <Input
              id="maintenance_margin_rate"
              name="maintenance_margin_rate"
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              defaultValue={settings.maintenance_margin_rate * 100}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="target_margin_ratio">Margin Ratio objetivo al precio de riesgo (%)</Label>
            <Input
              id="target_margin_ratio"
              name="target_margin_ratio"
              type="number"
              min={1}
              max={99}
              step={1}
              defaultValue={settings.target_margin_ratio * 100}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trading_fee_pct">Trading fee por lado (%)</Label>
            <Input
              id="trading_fee_pct"
              name="trading_fee_pct"
              type="number"
              min={0}
              step={0.001}
              defaultValue={settings.trading_fee_pct * 100}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="min_fee_per_contract">Fee mínimo por contrato / lado (USD)</Label>
            <Input
              id="min_fee_per_contract"
              name="min_fee_per_contract"
              type="number"
              min={0}
              step={0.01}
              defaultValue={settings.min_fee_per_contract}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notion</CardTitle>
          <CardDescription>
            Espejo secundario opcional y unidireccional. El token de integración y el
            database_id se configuran por variables de entorno del servidor, nunca aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between sm:max-w-xs">
            <Label htmlFor="notion_enabled">Activar espejo en Notion</Label>
            <Switch
              id="notion_enabled"
              name="notion_enabled"
              defaultChecked={settings.notion_enabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sincronización automática</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            Estado actual:{" "}
            <span className={settings.auto_sync_enabled ? "text-positive" : "text-warning"}>
              {settings.auto_sync_enabled ? "activada" : "desactivada"}
            </span>
          </p>
          <p className="text-muted-foreground">
            Este interruptor no es editable desde aquí todavía: se activa solo después de
            validar manualmente entre 20 y 50 operaciones reconstruidas contra Coinbase sin
            diferencias materiales.
          </p>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
