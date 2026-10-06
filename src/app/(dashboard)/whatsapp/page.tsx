import { ExternalLink, Map as MapIcon, MessageCircle, Mic } from "lucide-react";

import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lineaDeEstado } from "@/components/vida/whatsapp-tile";
import { cifrasDeHoy, enlaceAlPanel, leerTarjetaDeWhatsApp } from "@/core/whatsapp";

/**
 * WhatsApp: el estado del bot y sus cifras de hoy.
 *
 * Mínima a propósito. Los chats, el mapa y las grabaciones viven en el panel
 * de tu Mac (nunca suben); aquí sólo están los números que manda el bot y los
 * enlaces para abrir el panel, que pide entrar si este teléfono no está
 * recordado.
 */

const CIFRAS: { clave: string; etiqueta: string; descripcion: string }[] = [
  { clave: "chats_esperando", etiqueta: "Por atender", descripcion: "Chats donde te escribieron y nadie ha contestado (ni tú ni el bot)." },
  { clave: "tomados", etiqueta: "Tomados", descripcion: "Chats que el bot lleva por ti ahora." },
  { clave: "deudas", etiqueta: "Prometido por ti", descripcion: "Cosas que el bot dijo que le confirmarías a alguien." },
  { clave: "escaladas", etiqueta: "Para ti", descripcion: "Lo que el bot no quiso contestar solo y te pasó." },
  { clave: "sin_leer", etiqueta: "Sin leer", descripcion: "Mensajes sin leer en tu WhatsApp." },
  { clave: "llamadas_perdidas", etiqueta: "Llamadas perdidas", descripcion: "Llamadas de hoy que no contestaste." },
  { clave: "propuestas_abiertas", etiqueta: "Propuestas", descripcion: "Lo que el bot sacó de chats y reuniones y espera tu «sí»." },
];

export default async function WhatsAppPage() {
  const t = await leerTarjetaDeWhatsApp();
  const estado = lineaDeEstado(t);
  const panel = enlaceAlPanel(t.bot.panelUrl);
  const enlaces = panel
    ? [
        { href: panel, etiqueta: "Abrir panel", Icono: MessageCircle },
        { href: enlaceAlPanel(t.bot.panelUrl, "mapa")!, etiqueta: "Abrir mapa", Icono: MapIcon },
        { href: enlaceAlPanel(t.bot.panelUrl, "reuniones")!, etiqueta: "Subir grabación", Icono: Mic },
      ]
    : [];
  const deHoy = cifrasDeHoy(t);

  return (
    <>
      <PageHeader title="WhatsApp" description="El estado del bot y sus cifras. Los chats se quedan en tu Mac." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <span
              aria-hidden
              className={
                estado.tono === "ok"
                  ? "size-2.5 rounded-full bg-positive"
                  : estado.tono === "aviso"
                    ? "size-2.5 rounded-full bg-warning"
                    : "size-2.5 rounded-full bg-muted-foreground/40"
              }
            />
            {estado.texto}
          </CardTitle>
          <CardDescription>
            {t.bot.senal === "NUNCA"
              ? "El bot todavía no ha hablado con la app. Se conecta desde la Mac con su llave (Ajustes → El puente con el bot)."
              : [
                  t.latido ? `Último latido: ${t.latido}` : null,
                  t.bot.donde === "SERVIDOR" ? "Corre en el servidor" : t.bot.donde === "MAC" ? "Corre en tu Mac" : null,
                  t.bot.version ? `versión ${t.bot.version}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </CardDescription>
        </CardHeader>
        {t.bot.dosMotores ? (
          <CardContent>
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              Hay dos bots hablando a la vez con la misma cuenta (la Mac y el servidor, o dos arranques). Apaga uno: dos a la vez se
              pisan con WhatsApp.
            </p>
          </CardContent>
        ) : null}
        {enlaces.length > 0 ? (
          <CardContent className="flex flex-wrap gap-2">
            {enlaces.map(({ href, etiqueta, Icono }) => (
              <a
                key={etiqueta}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:bg-accent"
              >
                <Icono className="size-4" aria-hidden />
                {etiqueta}
                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
              </a>
            ))}
          </CardContent>
        ) : t.bot.senal !== "NUNCA" ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">El bot no ha dicho todavía la dirección de su panel.</p>
          </CardContent>
        ) : null}
        {t.bot.senal === "SIN_SENAL" ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Si la Mac está dormida, el panel no abre. Lo que hagas aquí se queda guardado y el bot se pone al día al volver.
            </p>
          </CardContent>
        ) : null}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t.hoy.fecha === null ? "Cifras" : deHoy ? "Hoy" : `Las últimas cifras (${t.hoy.fecha})`}
        </h2>
        {t.hoy.fecha === null ? (
          <p className="text-sm text-muted-foreground">Sin cifras todavía: llegan con el primer contacto del bot.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {CIFRAS.filter((c) => t.hoy.cifras[c.clave] !== undefined).map((c) => (
              <StatTile key={c.clave} label={c.etiqueta} value={t.hoy.cifras[c.clave]} description={c.descripcion} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
