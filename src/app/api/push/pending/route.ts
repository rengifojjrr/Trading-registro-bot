import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Qué avisar, en el momento de avisar.
 *
 * El push llega sin contenido y el service worker pregunta aquí qué enseñar.
 * Parece un rodeo y no lo es: un push con el contenido dentro puede llegar
 * veinte minutos tarde y decir algo que ya no es cierto -- «la sincronización
 * falló» cuando la siguiente ya fue bien --. Preguntando al despertar, lo que
 * se enseña es lo que hay.
 *
 * Y de paso evita cifrar el cuerpo, que es el único motivo por el que esto
 * necesitaría una librería de criptografía entera.
 */
export async function GET() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, count } = await supabase
    .from("notifications")
    .select("title, message, severity", { count: "exact" })
    .eq("user_id", user.id)
    .eq("is_read", false)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const ultima = data?.[0];

  if (!ultima || !count) {
    // Ya se leyó desde otro sitio: se dice que no hay nada y el service
    // worker no enseña nada, en vez de sacar un aviso vacío.
    return NextResponse.json({ hay: false });
  }

  return NextResponse.json({
    hay: true,
    title: ultima.title,
    // Con más de uno pendiente, decirlo: «tres cosas» y «una cosa» son
    // situaciones distintas y el aviso sólo cabe una vez.
    body: count > 1 ? `${ultima.message} (y ${count - 1} aviso(s) más)` : ultima.message,
    severity: ultima.severity,
  });
}
