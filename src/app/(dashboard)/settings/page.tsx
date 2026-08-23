import { cookies } from "next/headers";

import { AppearancePanel } from "@/components/layout/appearance-panel";
import { PageHeader } from "@/components/layout/page-header";
import { AutoSyncToggle } from "@/components/settings/auto-sync-toggle";
import { BackupCheck } from "@/components/settings/backup-check";
import { BackupExport } from "@/components/settings/backup-export";
import { ConnectionStatus } from "@/components/settings/connection-status";
import { NotionFieldMappings, type FieldMappingState } from "@/components/settings/notion-field-mappings";
import { RebuildHistory } from "@/components/settings/rebuild-history";
import { SyncNow } from "@/components/settings/sync-now";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readAppearance } from "@/lib/appearance/storage";
import { requireUser } from "@/lib/auth/require-user";
import { NOTION_FIELD_MAPPINGS } from "@/lib/notion/mapper";
import { createClient } from "@/lib/supabase/server";
import { readGateEvidence } from "@/lib/validation/evidence";
import { evaluateValidationGate } from "@/lib/validation/gate";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const store = await cookies();

  const [{ data: settings }, { data: fieldMappingRows }] = await Promise.all([
      supabase
        .from("app_settings")
        .select(
          "timezone, active_venue, sync_interval_minutes, reconciliation_hour_local, notion_enabled, auto_sync_enabled, maintenance_margin_rate, target_margin_ratio, trading_fee_pct, min_fee_per_contract, max_daily_loss, max_trades_per_day, max_risk_per_trade_pct, account_size, coinbase_key_rotated_at",
        )
        .eq("user_id", user.id)
        .single(),
      supabase.from("notion_field_mappings").select("internal_field, enabled").eq("user_id", user.id),
    ]);

  const disabledFields = new Set((fieldMappingRows ?? []).filter((r) => !r.enabled).map((r) => r.internal_field));
  const fieldMappings: FieldMappingState[] = NOTION_FIELD_MAPPINGS.map((m) => ({
    internalField: m.internalField,
    notionPropertyName: m.notionPropertyName,
    label: m.label,
    enabled: !disabledFields.has(m.internalField),
  }));

  const gate = evaluateValidationGate(await readGateEvidence(user.id));

  return (
    <>
      <PageHeader title="Configuración" />

      {/*
        Fuera del formulario a propósito. Todo lo de abajo se guarda en la
        base de datos con «Guardar cambios» y vale para tu cuenta se abra
        donde se abra; esto no se guarda en ningún sitio ni tiene botón:
        se aplica al pulsar y vive sólo en este navegador. Meterlo dentro
        pondría un botón de guardar debajo de algo que ya está aplicado.
      */}
      <Card>
        <CardHeader>
          <CardTitle>Apariencia</CardTitle>
          <CardDescription>
            Cómo se ve la aplicación. Se aplica al momento, no hace falta guardar, y sólo cambia
            este navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppearancePanel appearance={readAppearance((name) => store.get(name)?.value)} />
        </CardContent>
      </Card>

      {settings ? (
        <SettingsForm
          settings={settings}
          connectionSlot={
            <>
              <ConnectionStatus
                keyRotatedAt={settings?.coinbase_key_rotated_at ?? null}
                timezone={settings?.timezone || "UTC"}
              />
              <SyncNow />
              <RebuildHistory />
            </>
          }
          autoSyncSlot={
            <AutoSyncToggle
              enabled={settings.auto_sync_enabled}
              canEnable={gate.canEnable}
              blockedReason={gate.blockedReason}
            />
          }
          notionMappingsSlot={<NotionFieldMappings mappings={fieldMappings} />}
          backupSlot={
            <>
              <BackupExport />
              <BackupCheck />
            </>
          }
        />
      ) : null}
    </>
  );
}
