import "server-only";

import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * El secreto con el que el reloj de la base de datos se identifica ante
 * `/api/paper/tick`.
 *
 * Vive en `paper_cron_secret` y no en una variable de entorno por una razón
 * práctica: el reloj es un trabajo de `pg_cron` dentro de Postgres, y desde
 * ahí se puede leer una tabla pero no el entorno de Vercel. Guardarlo en la
 * base es lo que permite que el simulador se ponga en marcha sin que nadie
 * tenga que pegar secretos en dos consolas distintas y mantenerlos iguales.
 *
 * Se lee con el cliente de servicio porque la tabla tiene RLS y ninguna
 * política: es la forma de que ni el rol anónimo ni el autenticado la vean.
 * Se lee en cada petición y no se guarda en memoria: rotar el secreto tiene
 * que surtir efecto en el siguiente ciclo, no en el siguiente despliegue.
 */
export async function secretoDelReloj(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("paper_cron_secret")
    .select("secret")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[cron-secret] no se pudo leer el secreto del reloj:", error.message);
    return null;
  }
  return data?.secret ?? null;
}

/**
 * Comparación en tiempo constante, para no revelar por el reloj cuántos
 * caracteres del secreto acertó quien lo prueba. Con longitudes distintas
 * devuelve falso sin comparar, que es lo que haría `timingSafeEqual` pero
 * lanzando en vez de contestar.
 */
export function coincideSecreto(recibido: string | null, esperado: string | null): boolean {
  if (!recibido || !esperado) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
