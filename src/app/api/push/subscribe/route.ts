import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Dar y quitar permiso de avisos en este navegador.
 *
 * Una fila por dispositivo, con el `endpoint` de clave: volver a dar permiso
 * en el mismo teléfono no puede crear una segunda suscripción, o cada aviso
 * llegaría dos veces al mismo sitio.
 */
const bodySchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(request: Request) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: parsed.data.endpoint,
      user_id: user.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      // Para poder decir «tu iPhone» en vez de «un dispositivo» al listarlos.
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: "No se pudo guardar la suscripción." }, { status: 500 });
  }

  return NextResponse.json({ error: null });
}

export async function DELETE(request: Request) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const endpoint = (body as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== "string") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const supabase = await createClient();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  return NextResponse.json({ error: null });
}
