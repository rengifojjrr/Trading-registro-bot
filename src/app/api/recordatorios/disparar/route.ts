import { NextResponse } from "next/server";

import { coincideSecreto } from "@/lib/auth/secreto";
import { sendPushToUser } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/**
 * El reloj de la base pide aquí que suene el teléfono.
 *
 * `recordatorios_tick()` corre cada minuto dentro de Postgres (pg_cron). Cuando
 * hace sonar algo, apunta el disparo y el aviso de la campana, y llama aquí por
 * `pg_net` con el secreto de `core_reloj` en `x-reloj-secret`. Sólo entonces:
 * un minuto sin nada que sonar no llama.
 *
 * Aquí no se decide qué suena (eso ya lo decidió la base) ni se manda texto: el
 * push va vacío y el teléfono pide qué enseñar a `/api/push/pending` con su
 * sesión. Esta ruta sólo reclama los disparos sin avisar (marcándolos en el
 * mismo paso, para que dos llamadas no manden dos pushes) y despierta a cada
 * dueño una vez.
 *
 * Está en `PUBLIC_PATH_PREFIXES` porque el reloj no tiene sesión; sin el
 * secreto contesta 401 y no hace nada. No escribe nada de nadie en el registro.
 */
export async function POST(request: Request) {
  const presentado = request.headers.get("x-reloj-secret");
  if (!presentado) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Sin configurar." }, { status: 500 });
  }

  const { data: reloj } = await supabase.from("core_reloj").select("secret").eq("id", 1).maybeSingle();
  if (!coincideSecreto(presentado, reloj?.secret ?? null)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: usuarios, error } = await supabase.rpc("recordatorios_reclamar_push");
  if (error) return NextResponse.json({ error: "No se pudo leer qué avisar." }, { status: 500 });

  let enviados = 0;
  for (const u of (usuarios ?? []) as { user_id: string; n: number }[]) {
    const r = await sendPushToUser(u.user_id);
    enviados += r.sent;
  }

  return NextResponse.json({ ok: true, usuarios: (usuarios ?? []).length, enviados });
}
