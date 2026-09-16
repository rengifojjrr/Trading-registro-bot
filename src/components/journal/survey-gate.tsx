"use client";

import { ClipboardList } from "lucide-react";
import { useState } from "react";

import { TradeSurvey } from "@/components/journal/trade-survey";
import { Button } from "@/components/ui/button";
import type { SurveyTrade } from "@/lib/journal/survey";

/**
 * Las dos formas de que aparezca la encuesta.
 *
 * Que se abra sola es lo que hace que se conteste -- nadie va a buscar un
 * formulario para contarse a sí mismo cómo le fue --, y que se pueda abrir a
 * mano es lo que hace que cerrarla no duela: «ahora no» deja de ser una
 * decisión definitiva.
 *
 * Son dos componentes minúsculos y no uno con un `abierta` inicial porque la
 * diferencia no es un parámetro: uno sale sin pedir permiso y el otro es un
 * botón que hay que pulsar.
 */

/**
 * La que sale sola.
 *
 * **Echa el pestillo a la operación en cuanto la ve, y ahí está lo importante.**
 * Antes recibía la candidata del servidor y la seguía: cualquier cosa que
 * volviera a renderizar el panel --y contestar una pregunta lo hacía-- podía
 * traer `null`, porque al contestar la operación pasa a contar como apuntada
 * y deja de ser candidata. El cuadro se desmontaba a media encuesta y parecía
 * que se cerraba solo.
 *
 * Ahora la primera operación que llega se queda en el estado de aquí, y sólo
 * la cierra quien la está contestando. El servidor propone; una vez abierta,
 * manda esta pantalla.
 */
export function SurveyGate({ trade }: { trade: SurveyTrade | null }) {
  const [abierta, setAbierta] = useState<SurveyTrade | null>(trade);
  const [cerradaId, setCerradaId] = useState<string | null>(null);

  // Si no hay ninguna abierta y llega una candidata nueva, se abre. Lo que no
  // puede pasar es lo contrario -- que desaparezca la que se está
  // contestando -- y por eso no se lee `trade` directamente al pintar.
  if (!abierta && trade && trade.id !== cerradaId) setAbierta(trade);

  if (!abierta) return null;

  return (
    <TradeSurvey
      trade={abierta}
      onClose={() => {
        setCerradaId(abierta.id);
        setAbierta(null);
      }}
    />
  );
}

export function SurveyButton({ trade }: { trade: SurveyTrade }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAbierta(true)}>
        <ClipboardList className="size-3.5" aria-hidden />
        Contestar la encuesta
      </Button>
      {abierta ? (
        <TradeSurvey trade={trade} variante="manual" onClose={() => setAbierta(false)} />
      ) : null}
    </>
  );
}
