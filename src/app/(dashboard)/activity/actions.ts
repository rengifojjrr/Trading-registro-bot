"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.uuid();

/**
 * Marks one notification read. Notifications were previously write-only
 * from the user's side -- the table has always carried `is_read`, but
 * nothing in the UI could ever set it, so warnings piled up forever with
 * no way to acknowledge them.
 *
 * RLS already scopes every row to the caller; the explicit user_id filter
 * is defense in depth so a bad id can't touch another account's row even
 * if a policy were later loosened.
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const user = await requireUser();
  if (!uuidSchema.safeParse(notificationId).success) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  revalidatePath("/activity");
}

/** Marks every unread notification read at once -- the "clear the pile" action. */
export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  revalidatePath("/activity");
}
