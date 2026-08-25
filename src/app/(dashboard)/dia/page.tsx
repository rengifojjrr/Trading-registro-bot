import { redirect } from "next/navigation";

import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";

/**
 * `/dia` llevaba a un 404.
 *
 * La ficha del día existe como `/dia/[fecha]` y sólo se llegaba a ella
 * pulsando un día en el calendario. Escribir la dirección a mano, buscarla, o
 * llegar desde cualquier enlace que alguien diera por hecho daba «no
 * encontrado» -- que es la peor respuesta posible, porque parece que la
 * función no existe cuando existe y está a un clic.
 *
 * Redirige al día de hoy en la zona horaria del usuario, no en la del
 * servidor: a las 23:30 en Bogotá, el «hoy» del servidor ya es mañana, y
 * abriría un día vacío.
 */
export default async function DiaIndexPage() {
  const timezone = await userTimezone();
  redirect(`/dia/${todayIn(timezone)}`);
}
