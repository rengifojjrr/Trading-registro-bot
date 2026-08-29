"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Dar permiso de avisos en **este** dispositivo.
 *
 * Por dispositivo y no por cuenta: el permiso lo da el navegador, no el
 * servidor, y darlo en el portátil no hace que lleguen al teléfono. El texto
 * lo dice, porque «ya lo activé» y «lo activé en el otro sitio» es exactamente
 * la confusión que se produce si no.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  /**
   * Tres estados de verdad, no un booleano.
   *
   * «Todavía no lo sé» existe: hasta que el service worker responde no se
   * puede saber si hay suscripción, y pintar «desactivado» mientras tanto hace
   * que se pulse el botón para activar algo que ya estaba activo.
   */
  const [estado, setEstado] = useState<"cargando" | "activo" | "inactivo" | "denegado">("cargando");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;

    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (vivo) setEstado("denegado");
        return;
      }
      if (Notification.permission === "denied") {
        if (vivo) setEstado("denegado");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      if (vivo) setEstado(suscripcion ? "activo" : "inactivo");
    })();

    return () => {
      vivo = false;
    };
  }, []);

  async function activar() {
    if (!publicKey) return;
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "inactivo");
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        // Sin esto los navegadores rechazan la suscripción: obligan a que
        // cada aviso se le enseñe a la persona, y no admiten avisos
        // silenciosos que sólo despierten a la aplicación.
        userVisibleOnly: true,
        applicationServerKey: base64UrlABytes(publicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suscripcion.toJSON()),
      });
      const resultado = (await res.json()) as { error: string | null };
      if (resultado.error) {
        // Si el servidor no la guardó, la del navegador sobra: dejarla haría
        // que este dispositivo pareciera suscrito sin estarlo.
        await suscripcion.unsubscribe();
        toast.error(resultado.error);
        setEstado("inactivo");
        return;
      }

      setEstado("activo");
      toast.success("Los avisos llegarán a este dispositivo.");
    } catch {
      toast.error("No se pudo activar en este dispositivo.");
      setEstado("inactivo");
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setTrabajando(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      if (suscripcion) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: suscripcion.endpoint }),
        });
        await suscripcion.unsubscribe();
      }
      setEstado("inactivo");
      toast.success("Este dispositivo ya no recibirá avisos.");
    } catch {
      toast.error("No se pudo desactivar.");
    } finally {
      setTrabajando(false);
    }
  }

  if (!publicKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Falta configurar las claves de avisos en el servidor (<code>VAPID_PUBLIC_KEY</code>,{" "}
        <code>VAPID_PRIVATE_KEY</code> y <code>VAPID_SUBJECT</code>). Hasta entonces los avisos sólo
        se ven dentro de la aplicación.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {estado === "denegado" ? (
        <p className="text-xs text-muted-foreground">
          Este navegador tiene los avisos bloqueados. Hay que permitirlos desde sus ajustes de
          sitio; desde aquí no se puede volver a pedir.
        </p>
      ) : (
        <>
          <Button
            variant={estado === "activo" ? "outline" : "default"}
            size="sm"
            className="gap-1.5"
            disabled={trabajando || estado === "cargando"}
            onClick={() => void (estado === "activo" ? desactivar() : activar())}
          >
            {estado === "activo" ? (
              <BellOff className="size-4" aria-hidden />
            ) : (
              <Bell className="size-4" aria-hidden />
            )}
            {estado === "cargando"
              ? "Comprobando…"
              : estado === "activo"
                ? "Dejar de recibir aquí"
                : "Recibir avisos en este dispositivo"}
          </Button>
          <span className="text-xs text-muted-foreground">
            El permiso es de este dispositivo: activarlo en el móvil no lo activa en el ordenador.
          </span>
        </>
      )}
    </div>
  );
}

/**
 * La clave pública, de texto a los bytes que pide el navegador.
 *
 * Va en base64 «de URL» --con `-` y `_` en vez de `+` y `/`-- porque viaja en
 * cabeceras y direcciones; `atob` sólo entiende el normal, así que hay que
 * deshacer el cambio antes.
 */
function base64UrlABytes(base64Url: string): ArrayBuffer {
  const relleno = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const normal = (base64Url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = window.atob(normal);
  // Se devuelve el `ArrayBuffer` y no el `Uint8Array`: el tipo de
  // `applicationServerKey` es `BufferSource`, y con `Uint8Array<ArrayBufferLike>`
  // TypeScript no lo acepta -- podría estar respaldado por memoria compartida.
  return Uint8Array.from(binario, (c) => c.charCodeAt(0)).buffer;
}
