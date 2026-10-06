import { NextResponse } from "next/server";
import { z } from "zod";

import { userForApi } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Los dos botones de la notificación de un recordatorio: «Hecho» y «En 1 h».
 *
 * Los pulsa el service worker con la sesión del teléfono (sin abrir la
 * aplicación). Hacen lo mismo que los botones de Hoy y de Recordatorios: las
 * funciones `recordatorio_hecho` y `recordatorio_posponer` de la base, con las
 * RLS de quien llama (sólo lo suyo). Sin sesión, o con una cuenta con segundo
 * factor y una sesión sin el código, 401.
 */
const cuerpo = z
  .object({
    id: z.string().uuid(),
    fireAt: z.string().datetime({ offset: true }),
    accion: z.enum(["hecho", "posponer"]),
    minutos: z.number().int().min(5).max(1440).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const user = await userForApi();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let datos: unknown;
  try {
    datos = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const parsed = cuerpo.safeParse(datos);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const supabase = await createClient();
  const { id, fireAt, accion, minutos } = parsed.data;

  if (accion === "hecho") {
    const { data, error } = await supabase.rpc("recordatorio_hecho", { p_reminder: id, p_fire_at: fireAt, p_via: "PUSH" });
    if (error || data !== true) return NextResponse.json({ error: "No encontré ese recordatorio." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase.rpc("recordatorio_posponer", {
    p_reminder: id,
    p_fire_at: fireAt,
    p_minutos: minutos ?? 60,
  });
  if (error || !data) return NextResponse.json({ error: "No encontré ese recordatorio." }, { status: 404 });
  return NextResponse.json({ ok: true, vuelve: data });
}
