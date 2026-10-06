import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { cifrasDeHoy, leerTarjetaDeWhatsApp, type TarjetaDeWhatsApp } from "@/core/whatsapp";

/**
 * La tarjeta de WhatsApp en Hoy: si el bot da señales y cuánto te espera.
 *
 * Gris neutro, sólo cifras y un punto de estado con su texto al lado (nunca
 * sólo el color). Ningún nombre ni texto de nadie: eso vive en la Mac. Lleva a
 * `/whatsapp`, donde están los enlaces al panel.
 */
export async function WhatsAppTile() {
  let tarjeta: TarjetaDeWhatsApp | null = null;
  try {
    tarjeta = await leerTarjetaDeWhatsApp();
  } catch {
    // Que la tarjeta no salga no puede tumbar Hoy.
    tarjeta = null;
  }
  return <WhatsAppTileVista tarjeta={tarjeta} />;
}

export function lineaDeEstado(t: TarjetaDeWhatsApp | null): { texto: string; tono: "ok" | "aviso" | "nada" } {
  if (!t || t.bot.senal === "NUNCA") return { texto: "Sin conectar", tono: "nada" };
  if (t.bot.senal === "SIN_SENAL") return { texto: `Sin señal ${t.latido ?? ""}`.trim(), tono: "aviso" };
  if (t.bot.waConectado === false) return { texto: "WhatsApp desconectado", tono: "aviso" };
  return { texto: "Bot en línea", tono: "ok" };
}

export function cifraPrincipal(t: TarjetaDeWhatsApp | null): string | null {
  if (!t || t.hoy.fecha === null) return null;
  const esperando = t.hoy.cifras.chats_esperando ?? 0;
  const tomados = t.hoy.cifras.tomados ?? 0;
  const partes = [`${esperando} por atender`];
  if (tomados > 0) partes.push(`${tomados} ${tomados === 1 ? "tomado" : "tomados"}`);
  return partes.join(" · ");
}

export function WhatsAppTileVista({ tarjeta }: { tarjeta: TarjetaDeWhatsApp | null }) {
  const estado = lineaDeEstado(tarjeta);
  const cifra = cifraPrincipal(tarjeta);
  const viejas = tarjeta && cifra && !cifrasDeHoy(tarjeta);
  return (
    <Link
      href="/whatsapp"
      className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25"
    >
      <span className="flex items-center gap-2">
        <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">WhatsApp</span>
      </span>
      <span className="flex flex-col gap-1">
        <span className={cifra ? "text-lg font-semibold leading-tight tabular-nums text-foreground" : "text-sm text-muted-foreground"}>
          {cifra ?? "Sin cifras todavía"}
          {viejas ? <span className="ml-1 text-xs font-normal text-muted-foreground">(de otro día)</span> : null}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={
              estado.tono === "ok"
                ? "size-2 rounded-full bg-positive"
                : estado.tono === "aviso"
                  ? "size-2 rounded-full bg-warning"
                  : "size-2 rounded-full bg-muted-foreground/40"
            }
          />
          {estado.texto}
        </span>
      </span>
    </Link>
  );
}
