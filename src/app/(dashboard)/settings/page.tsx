import { PageHeader } from "@/components/layout/page-header";
import { AutoSyncToggle } from "@/components/settings/auto-sync-toggle";
import { BackupExport } from "@/components/settings/backup-export";
import { ConnectionStatus } from "@/components/settings/connection-status";
import { NotionFieldMappings, type FieldMappingState } from "@/components/settings/notion-field-mappings";
import { RebuildHistory } from "@/components/settings/rebuild-history";
import { SyncNow } from "@/components/settings/sync-now";
import { requireUser } from "@/lib/auth/require-user";
import { NOTION_FIELD_MAPPINGS } from "@/lib/notion/mapper";
import { createClient } from "@/lib/supabase/server";
import { evaluateValidationGate } from "@/lib/validation/gate";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: settings }, { data: fieldMappingRows }, { data: verifications }, { count: closedCount }] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select(
          "timezone, active_venue, sync_interval_minutes, reconciliation_hour_local, notion_enabled, auto_sync_enabled, maintenance_margin_rate, target_margin_ratio, trading_fee_pct, min_fee_per_contract, max_daily_loss, max_trades_per_day, max_risk_per_trade_pct, account_size, coinbase_key_rotated_at",
        )
        .eq("user_id", user.id)
        .single(),
      supabase.from("notion_field_mappings").select("internal_field, enabled").eq("user_id", user.id),
      supabase.from("trade_verifications").select("matches").eq("user_id", user.id),
      supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "CLOSED"),
    ]);

  const disabledFields = new Set((fieldMappingRows ?? []).filter((r) => !r.enabled).map((r) => r.internal_field));
  const fieldMappings: FieldMappingState[] = NOTION_FIELD_MAPPINGS.map((m) => ({
    internalField: m.internalField,
    notionPropertyName: m.notionPropertyName,
    label: m.label,
    enabled: !disabledFields.has(m.internalField),
  }));

  const verificationRows = verifications ?? [];
  const gate = evaluateValidationGate({
    matching: verificationRows.filter((v) => v.matches).length,
    mismatching: verificationRows.filter((v) => !v.matches).length,
    available: closedCount ?? 0,
  });

  return (
    <>
      <PageHeader title="Configuración" />
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
          backupSlot={<BackupExport />}
        />
      ) : null}
    </>
  );
}
