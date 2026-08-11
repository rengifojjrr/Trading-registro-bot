"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  timezone: z.string().min(1, "Selecciona una zona horaria."),
  active_venue: z.enum(["FCM", "INTX"]),
  sync_interval_minutes: z.coerce.number().int().min(1).max(60),
  reconciliation_hour_local: z.coerce.number().int().min(0).max(23),
  notion_enabled: z.preprocess((v) => v === "on" || v === true, z.boolean()),
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
    })
    .eq("user_id", user.id);

  if (error) {
    return { error: "No se pudo guardar la configuración.", success: false };
  }

  revalidatePath("/settings");
  return { error: null, success: true };
}
