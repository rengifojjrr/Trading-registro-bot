"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { InfoHint } from "@/components/shared/info-hint";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { updateSettings, type SettingsState } from "./actions";

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

const TABS = [
  { id: "general", label: "General" },
  { id: "riesgo", label: "Riesgo" },
  { id: "integraciones", label: "Integraciones" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Settings split into tabs instead of one long scroll of five unrelated
 * cards (timezone, Coinbase product, risk parameters, Notion, auto-sync).
 *
 * Inactive panels are hidden with CSS rather than unmounted, deliberately:
 * this is a single form with a single save button, so an unmounted panel's
 * inputs would drop out of the submitted FormData and the server action --
 * which requires every field -- would reject the save with a validation
 * error the user couldn't see the cause of.
 */
export function SettingsForm({
  settings,
  connectionSlot,
  notionMappingsSlot,
}: {
  settings: AppSettingsRow;
  /** Coinbase connection status + manual sync trigger; rendered inside the General tab. */
  connectionSlot?: ReactNode;
  /** Per-field Notion mirror toggles; rendered inside the Integraciones tab. */
  notionMappingsSlot?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(updateSettings, initialState);
  const [activeTab, setActiveTab] = useState<TabId>("general");

  useEffect(() => {
    if (state.success) toast.success("Configuración guardada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Secciones de configuración"
        className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <TabPanel active={activeTab === "general"}>
        {connectionSlot}

        <Card>
          <CardHeader>
            <CardTitle>Zona horaria y sincronización</CardTitle>
            <CardDescription>
              Todas las fechas se guardan en UTC y se muestran en esta zona.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timezone">Zona horaria</Label>
              <TimezoneSelect name="timezone" defaultValue={settings.timezone} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sync_interval_minutes">Cada cuántos minutos sincronizar</Label>
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
              <Label htmlFor="reconciliation_hour_local" className="flex items-center gap-1.5">
                Hora de la revisión nocturna
                <InfoHint label="Revisión nocturna">
                  Una vez al día la app compara todo lo que tiene guardado contra Coinbase para detectar
                  diferencias. Elige una hora en la que no sueles operar.
                </InfoHint>
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
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <Label htmlFor="active_venue" className="flex items-center gap-1.5">
                Venue activo
                <InfoHint label="Venue activo">
                  CFM son los futuros regulados de EE. UU. y es la vía recomendada. INTX (perpetuos
                  internacionales) se retira el 9 de septiembre de 2026 según Coinbase, así que su adaptador
                  queda marcado como experimental.
                </InfoHint>
              </Label>
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
      </TabPanel>

      <TabPanel active={activeTab === "riesgo"}>
        <Card>
          <CardHeader>
            <CardTitle>Parámetros de riesgo y margen</CardTitle>
            <CardDescription>
              Los usa la calculadora de la sección Riesgo. Cópialos de tu cuenta de Coinbase -- pueden cambiar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maintenance_margin_rate" className="flex items-center gap-1.5">
                Maintenance Margin Rate (%)
                <InfoHint label="Maintenance Margin Rate">
                  El margen mínimo que Coinbase exige para mantener una posición abierta. No lo expone por API,
                  así que se copia a mano desde tu cuenta.
                </InfoHint>
              </Label>
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
              <Label htmlFor="target_margin_ratio" className="flex items-center gap-1.5">
                Margin Ratio objetivo (%)
                <InfoHint label="Margin Ratio objetivo">
                  Tu límite de comodidad: qué tan cerca del margen mínimo aceptas llegar antes de considerar que
                  la posición está en riesgo. Más bajo = más conservador.
                </InfoHint>
              </Label>
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

        <p className="text-xs text-muted-foreground">
          El initial margin (día y noche) y el funding se leen en vivo desde Coinbase para cada producto, así que
          no se configuran aquí.
        </p>
      </TabPanel>

      <TabPanel active={activeTab === "integraciones"}>
        <Card>
          <CardHeader>
            <CardTitle>Notion</CardTitle>
            <CardDescription>
              Copia de respaldo opcional y en un solo sentido. El token y el database_id se configuran por
              variables de entorno del servidor, nunca aquí.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3 sm:max-w-sm">
              <Label htmlFor="notion_enabled">Activar copia en Notion</Label>
              <Switch id="notion_enabled" name="notion_enabled" defaultChecked={settings.notion_enabled} />
            </div>
          </CardContent>
        </Card>

        {notionMappingsSlot}

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
              Todavía no se puede cambiar desde aquí: se activa solo después de validar manualmente entre 20 y 50
              operaciones contra Coinbase sin diferencias.
            </p>
          </CardContent>
        </Card>
      </TabPanel>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

function TabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" className={cn("flex-col gap-6", active ? "flex" : "hidden")}>
      {children}
    </div>
  );
}
