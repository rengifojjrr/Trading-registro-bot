import { PageHeader } from "@/components/layout/page-header";
import { BackupExport } from "@/components/settings/backup-export";
import { ConnectionStatus } from "@/components/settings/connection-status";
import { NotionFieldMappings, type FieldMappingState } from "@/components/settings/notion-field-mappings";
import { SyncNow } from "@/components/settings/sync-now";
import { requireUser } from "@/lib/auth/require-user";
import { NOTION_FIELD_MAPPINGS } from "@/lib/notion/mapper";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: settings }, { data: fieldMappingRows }] = await Promise.all([
    supabase
      .from("app_settings")
      .select(
        "timezone, active_venue, sync_interval_minutes, reconciliation_hour_local, notion_enabled, auto_sync_enabled, maintenance_margin_rate, target_margin_ratio, trading_fee_pct, min_fee_per_contract",
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

  return (
    <>
      <PageHeader title="Configuración" />
      {settings ? (
        <SettingsForm
          settings={settings}
          connectionSlot={
            <>
              <ConnectionStatus />
              <SyncNow />
            </>
          }
          notionMappingsSlot={<NotionFieldMappings mappings={fieldMappings} />}
          backupSlot={<BackupExport />}
        />
      ) : null}
    </>
  );
}
