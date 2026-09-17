import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { coincideSecreto, secretoDelReloj } from "@/lib/paper/cron-secret";
import { medirLoQueFalte, type ResultadoDeMedir } from "@/lib/paper/measurement-store";
import { correrCicloDePapel } from "@/lib/paper/runner";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Dispara un ciclo del simulador: una vela de cada bot encendido.
 *
 * Pensado para un cron -- lo llama `.github/workflows/paper-trading-tick.yml`
 * cada cinco minutos -- pero también sirve para el botón de «evaluar ahora» de
 * la pantalla, y de ahí las dos puertas de entrada:
 *
 *   * Con el secreto correcto en `x-cron-secret` (o en `Authorization: Bearer`,
 *     que es como lo manda Vercel Cron y lo que ya espera
 *     `lib/sync/verify-cron-request.ts`), corre para **todos** los usuarios.
 *
 *   * Sin secreto, sólo para quien esté identificado, y sólo sobre sus propios
 *     bots. Es lo que hace que el simulador funcione en un despliegue donde
 *     `CRON_SECRET` todavía no está configurado, sin que eso signifique dejar
 *     la ruta abierta: un ciclo ajeno no se puede disparar desde una sesión.
 *
 * Es `POST` y no `GET` a propósito, aunque los crons del repositorio sean
 * `GET`: esto escribe posiciones y operaciones. Un `GET` que muta lo ejecuta
 * cualquier cosa que precargue enlaces.
 */
export async function POST(request: Request) {
  const secreto = serverEnv().CRON_SECRET;
  const cabecera = request.headers.get("x-cron-secret");
  const autorizacion = request.headers.get("authorization");
  const portador = autorizacion?.startsWith("Bearer ") ? autorizacion.slice("Bearer ".length) : null;
  const presentado = cabecera ?? portador;

  // Dos secretos válidos, no uno. El de la variable de entorno es el de
  // siempre, el que espera el resto de crons del repositorio. El de la base
  // de datos es el que usa el reloj de pg_cron, que corre dentro de Postgres
  // y puede leer una tabla pero no el entorno de Vercel. Sin él, poner el
  // simulador en marcha exigía pegar el mismo secreto en dos consolas y
  // mantenerlo igual en las dos, y en la práctica nunca se hizo: el paso del
  // ciclo salió omitido en todas las ejecuciones de GitHub.
  //
  // El de la base se consulta sólo si alguien presenta un secreto y el del
  // entorno no lo explica: una petición con sesión no paga la lectura.
  const esCronDelEntorno = coincideSecreto(presentado, secreto ?? null);
  const esCronDelReloj =
    !esCronDelEntorno && presentado !== null && coincideSecreto(presentado, await secretoDelReloj());
  const esCron = esCronDelEntorno || esCronDelReloj;

  // Presentar un secreto que no vale es un intento, no un despiste: se corta
  // aquí en vez de dejarlo caer al camino de la sesión, donde un 401 por otro
  // motivo confundiría el diagnóstico.
  if ((cabecera !== null || autorizacion !== null) && !esCron) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let userId: string | undefined;

  if (!esCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Un 401 y no el `redirect("/login")` de `requireUser`: quien llama a esto
    // es un `fetch`, y una redirección al formulario de acceso le llega como
    // una página HTML donde esperaba un JSON.
    if (!user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
    userId = user.id;
  }

  try {
    const resumen = await correrCicloDePapel(userId ? { userId } : {});

    // Y de paso, un par de estrategias de la biblioteca que estén sin medir.
    //
    // Lo medido no es de nadie --misma biblioteca, mismas velas públicas,
    // mismo motor-- así que no hace falta que nadie lo pida: puede hacerlo el
    // reloj, y entonces la pantalla llega con los números puestos en vez de
    // con once «Sin medir» esperando a que alguien pulse un botón.
    //
    // Sólo en el camino del cron. Una sesión que pulsa «evaluar ahora» quiere
    // ver su ciclo, no pagar veinticuatro peticiones a Coinbase por el camino.
    //
    // Y aparte del resultado del ciclo: que la biblioteca no se pueda medir no
    // puede convertir un ciclo que operó bien en un 500.
    const medidas = esCron ? await medirSinRomperElCiclo() : [];

    return NextResponse.json({ ...resumen, medidas: medidas.length });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error("[api/paper/tick]", mensaje);
    // Un 500 con el motivo dentro, no un 500 a secas: el cron llama con
    // `curl --fail-with-body` justamente para que el registro de GitHub diga
    // qué pasó en lugar de un código de salida suelto.
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

/**
 * Medir es el extra del ciclo, no su trabajo.
 *
 * Aislado para que quede escrito de una vez: lo que este `catch` protege no es
 * la medición sino el ciclo. Las operaciones ya están escritas cuando esto
 * corre; devolver un 500 porque Coinbase no contestó a una consulta de
 * histórico haría que el registro del reloj dijera que el ciclo falló cuando
 * el ciclo fue bien, y eso es la clase de aviso que enseña a ignorar los
 * avisos.
 */
async function medirSinRomperElCiclo(): Promise<ResultadoDeMedir[]> {
  try {
    return await medirLoQueFalte();
  } catch (error) {
    console.error("[api/paper/tick] al medir la biblioteca", error);
    return [];
  }
}
