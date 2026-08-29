"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  dequeue,
  markFailed,
  pending,
  readQueue,
  writeQueue,
  type QueuedWrite,
} from "@/lib/offline/queue";

/**
 * Manda lo que se apuntó sin conexión, en cuanto la hay.
 *
 * Vive en el layout y no en cada formulario: la conexión vuelve una vez y hay
 * que vaciar la cola entera, no la parte que resulte que esté en pantalla.
 *
 * Se envían **en orden y de una en una**. En paralelo sería más rápido, pero
 * dos escrituras del mismo día que llegan a la vez pueden pisarse, y ordenarlas
 * es justamente lo que la cola promete.
 */
export function OfflineQueue() {
  const router = useRouter();
  /**
   * La cola y la conexión, leídas en el inicializador y no en un efecto.
   *
   * Un `setState` en un efecto pinta primero el estado vacío y luego el real,
   * así que el aviso de «sin conexión» parpadearía en cada carga. `useState`
   * con función sólo corre en el cliente en el primer render, que es donde
   * `localStorage` y `navigator` existen.
   */
  const [cola, setCola] = useState<QueuedWrite[]>(() =>
    typeof window === "undefined" ? [] : readQueue(window.localStorage),
  );
  const [enviando, setEnviando] = useState(false);
  const [sinConexion, setSinConexion] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );

  const vaciar = useCallback(async () => {
    if (enviando) return;
    // `navigator.onLine` en falso es fiable: significa que no hay red. En
    // verdadero no promete nada -- puede haber wifi sin internet -- así que
    // sólo se usa para no intentarlo cuando se sabe seguro que no.
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    let actual = pending(readQueue(window.localStorage));
    if (actual.length === 0) return;

    setEnviando(true);
    let enviadas = 0;

    try {
      for (const escritura of actual) {
        try {
          const res = await fetch(escritura.url, {
            method: escritura.method,
            headers: { "Content-Type": "application/json" },
            // El momento real viaja con el cuerpo: lo que llega al servidor es
            // «esto pasó a las 21:40», no «esto está pasando ahora».
            body: JSON.stringify({ ...(escritura.body as object), registradoEn: escritura.at }),
          });

          if (res.ok) {
            actual = dequeue(actual, escritura.id);
            enviadas += 1;
          } else {
            actual = markFailed(actual, escritura.id);
          }
        } catch {
          // Se cortó otra vez: se deja lo que queda para el próximo intento.
          actual = markFailed(actual, escritura.id);
          break;
        }
        writeQueue(window.localStorage, actual);
      }
    } finally {
      writeQueue(window.localStorage, actual);
      setCola(actual);
      setEnviando(false);
    }

    if (enviadas > 0) {
      toast.success(
        enviadas === 1 ? "Se envió lo que apuntaste sin conexión." : `Se enviaron ${enviadas} registros.`,
      );
      router.refresh();
    }
  }, [enviando, router]);

  useEffect(() => {
    const alVolver = () => {
      setSinConexion(false);
      void vaciar();
    };
    const alCaerse = () => setSinConexion(true);

    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alCaerse);

    // Y al abrir la aplicación: la conexión pudo volver mientras estaba
    // cerrada, y entonces el evento `online` no llega nunca.
    //
    // Fuera del efecto, no dentro. Vaciar la cola pone el estado «enviando»,
    // y hacerlo durante el efecto sería pintar dos veces la primera pantalla
    // por trabajo de fondo que no cambia lo que se ve. Un cero de retraso
    // basta: lo saca del render.
    const alArrancar = window.setTimeout(() => void vaciar(), 0);

    return () => {
      window.clearTimeout(alArrancar);
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alCaerse);
    };
    // Sólo al montar: `vaciar` cambia en cada render y volver a suscribirse en
    // cada uno haría que la cola se intentara vaciar sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendientes = pending(cola);
  if (pendientes.length === 0 && !sinConexion) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warning/40 bg-warning/5 px-4 py-2 text-xs">
      <CloudOff className="size-3.5 shrink-0 text-warning" aria-hidden />
      <span className="text-warning-foreground">
        {pendientes.length > 0
          ? `${pendientes.length} registro(s) esperando a que vuelva la conexión.`
          : "Sin conexión. Lo que apuntes se manda cuando vuelva."}
      </span>
      {pendientes.length > 0 ? (
        <button
          type="button"
          onClick={() => void vaciar()}
          disabled={enviando}
          className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 font-medium text-warning-foreground transition-colors hover:bg-warning/10 disabled:opacity-50"
        >
          <RefreshCw className={enviando ? "size-3 animate-spin" : "size-3"} aria-hidden />
          {enviando ? "Enviando…" : "Intentar ahora"}
        </button>
      ) : null}
    </div>
  );
}
