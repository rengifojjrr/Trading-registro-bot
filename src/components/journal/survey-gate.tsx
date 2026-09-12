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

export function SurveyGate({ trade }: { trade: SurveyTrade }) {
  const [abierta, setAbierta] = useState(true);
  if (!abierta) return null;
  return <TradeSurvey trade={trade} onClose={() => setAbierta(false)} />;
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
