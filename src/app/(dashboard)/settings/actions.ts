"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { NOTION_FIELD_MAPPINGS } from "@/lib/notion/mapper";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  timezone: z.string().min(1, "Selecciona una zona horaria."),
  active_venue: z.enum(["FCM", "INTX"]),
  sync_interval_minutes: z.coerce.number().int().min(1).max(60),
  reconciliation_hour_local: z.coerce.number().int().min(0).max(23),
  notion_enabled: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  // Entered as percent (e.g. 10 for 10%), stored as a fraction (0.10) --
  // see lib/risk/margin.ts's MarginConstants, which expects fractions.
  maintenance_margin_rate: z.coerce.number().min(0.01).max(100),
  target_margin_ratio: z.coerce.number().min(1).max(99),
  trading_fee_pct: z.coerce.number().min(0).max(100),
  min_fee_per_contract: z.coerce.number().min(0),
});

export type SettingsState = { error: string | null; success: boolean };

export async function updateSettings(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    timezone: formData.get("timezone"),
    active_venue: formData.get("active_venue"),
    sync_interval_minutes: formData.get("sync_interval_minutes"),
    reconciliation_hour_local: formData.get("reconciliation_hour_local"),
    notion_enabled: formData.get("notion_enabled"),
    maintenance_margin_rate: formData.get("maintenance_margin_rate"),
    target_margin_ratio: formData.get("target_margin_ratio"),
    trading_fee_pct: formData.get("trading_fee_pct"),
    min_fee_per_contract: formData.get("min_fee_per_contract"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  // Validate the timezone is a real IANA zone Luxon/the runtime can resolve,
  // rather than trusting arbitrary client input.
  try {
    Intl.DateTimeFormat(undefined, { timeZone: parsed.data.timezone });
  } catch {
    return { error: "Zona horaria no reconocida.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      timezone: parsed.data.timezone,
      active_venue: parsed.data.active_venue,
      sync_interval_minutes: parsed.data.sync_interval_minutes,
      reconciliation_hour_local: parsed.data.reconciliation_hour_local,
      notion_enabled: parsed.data.notion_enabled,
      maintenance_margin_rate: parsed.data.maintenance_margin_rate / 100,
      target_margin_ratio: parsed.data.target_margin_ratio / 100,
      trading_fee_pct: parsed.data.trading_fee_pct / 100,
      min_fee_per_contract: parsed.data.min_fee_per_contract,
    })
    .eq("user_id", user.id);

  if (error) {
    return { error: "No se pudo guardar la configuración.", success: false };
  }

  revalidatePath("/settings");
  return { error: null, success: true };
}

/**
 * Toggles whether one field is included in the Notion outbound mirror (see
 * lib/notion/sync.ts's loadTradeContext, which already reads
 * notion_field_mappings.enabled into buildNotionProperties' disabledFields).
 * Called directly from the client (components/settings/notion-field-mappings.tsx)
 * rather than through a <form action> -- there's one independent toggle per
 * field, not a single form to submit.
 */
export async function setNotionFieldMappingEnabled(internalField: string, enabled: boolean): Promise<void> {
  const user = await requireUser();

  const mapping = NOTION_FIELD_MAPPINGS.find((m) => m.internalField === internalField);
  if (!mapping) return; // unknown field -- ignore rather than write junk

  const supabase = await createClient();
  await supabase.from("notion_field_mappings").upsert(
    {
      user_id: user.id,
      internal_field: mapping.internalField,
      notion_property_name: mapping.notionPropertyName,
      notion_property_type: mapping.notionPropertyType,
      enabled,
    },
    { onConflict: "user_id,internal_field" },
  );

  revalidatePath("/settings");
}
