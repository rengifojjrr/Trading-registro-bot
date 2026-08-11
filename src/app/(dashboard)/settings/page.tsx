import { PageHeader } from "@/components/layout/page-header";
import { ConnectionStatus } from "@/components/settings/connection-status";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select(
      "timezone, active_venue, sync_interval_minutes, reconciliation_hour_local, notion_enabled, auto_sync_enabled",
    )
    .eq("user_id", user.id)
    .single();

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Zona horaria, sincronización, producto de Coinbase e integraciones."
      />
      <ConnectionStatus />
      {settings ? <SettingsForm settings={settings} /> : null}
    </>
  );
}
