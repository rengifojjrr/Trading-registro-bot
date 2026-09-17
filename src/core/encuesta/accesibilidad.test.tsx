// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fallosDeAccesibilidad } from "@/test-support/axe";

import { Encuesta } from "./encuesta";
import { FichaDeRespuestas } from "./ficha";
import type { Paso, Respuestas } from "./pasos";
/**
 * La encuesta, medida con axe y no prometida.
 *
 * La suite de accesibilidad de verdad corre con Playwright sobre seis páginas
 * de trading, y ninguna de ellas tiene una encuesta. Desde que los seis
 * módulos se contestan así, esto es la principal superficie de la aplicación
 * --es *la* forma de escribir en ella-- y no tenía ninguna comprobación.
 *
 * En jsdom no se puede medir todo: el contraste de color necesita un motor de
 * maquetación, y aquí no lo hay. Lo que sí se mide es justo la clase de fallo
 * que aparece de verdad al escribir componentes: el botón que se queda sin
 * nombre porque su texto se volvió un icono, el campo sin etiqueta, el ARIA
 * inventado, la lista mal formada. Ésos no necesitan pintar nada.
 */

/** Un paso de cada tipo: es donde vive el marcado del motor. */
const TODOS_LOS_TIPOS: Paso[] = [
  {
    id: "escala",
    tipo: "escala",
    pregunta: "¿Qué tal?",
    ayuda: "De 0 a 10.",
    opciones: Array.from({ length: 11 }, (_, i) => ({ valor: i, etiqueta: String(i) })),
  },
  {
    id: "chips",
    tipo: "chips",
    multiple: true,
    pregunta: "¿Qué hiciste?",
    opciones: ["Leer", "Correr"],
    ninguno: "Nada",
  },
  {
    id: "grupos",
    tipo: "chips",
    multiple: false,
    pregunta: "¿Por dónde va?",
    grupos: [{ titulo: "Antes", opciones: [{ valor: "a", etiqueta: "Una", detalle: "La primera" }] }],
  },
  { id: "hora", tipo: "hora", pregunta: "¿A qué hora?", atajos: ["22:00", "23:00"] },
  {
    id: "fecha",
    tipo: "fecha",
    pregunta: "¿Qué día fue?",
    hoy: "2026-03-15",
    atajos: [{ etiqueta: "Hoy", dias: 0 }, { etiqueta: "Ayer", dias: 1 }],
  },
  { id: "texto", tipo: "texto", pregunta: "¿Qué soñaste?", lineas: 4 },
  { id: "linea", tipo: "linea", pregunta: "¿Dónde?" },
  { id: "numero", tipo: "numero", pregunta: "¿Cuántos?", prefijo: "$" },
  { id: "imagen", tipo: "imagen", pregunta: "¿Una foto?", pista: "El gráfico con tus líneas" },
];

describe("el motor de la encuesta", () => {
  it.each(TODOS_LOS_TIPOS.map((p) => [p.id, p] as const))(
    "una pregunta de tipo %s no tiene fallos de accesibilidad",
    async (_id, paso) => {
      const { container } = render(
        <Encuesta
          pasos={[paso]}
          respuestas={{}}
          onCambio={vi.fn()}
          onGuardar={vi.fn()}
          acento="--mod-sleep"
        />,
      );

      expect(await fallosDeAccesibilidad(container)).toEqual([]);
    },
  );

  it("la pantalla final tampoco", async () => {
    const { container } = render(
      <Encuesta
        pasos={[TODOS_LOS_TIPOS[0]]}
        respuestas={{ escala: 8 }}
        onCambio={vi.fn()}
        onGuardar={vi.fn()}
        pasoInicial=""
        final={<p>Noche apuntada.</p>}
      />,
    );

    expect(await fallosDeAccesibilidad(container)).toEqual([]);
  });
});

describe("el índice de una ficha", () => {
  const PASOS: Paso[] = [
    { id: "title", tipo: "linea", pregunta: "¿Qué hay que hacer?" },
    { id: "notes", tipo: "linea", pregunta: "¿Alguna nota?" },
  ];

  const RESPUESTAS: Respuestas = { title: "Llamar al fontanero", notes: "" };

  it("no tiene fallos de accesibilidad", async () => {
    const { container } = render(
      <FichaDeRespuestas
        pasos={PASOS}
        respuestas={RESPUESTAS}
        etiquetas={{ title: "Qué", notes: "Nota" }}
        onIr={vi.fn()}
      />,
    );

    expect(await fallosDeAccesibilidad(container)).toEqual([]);
  });

  it("cada línea se anuncia con su nombre y su valor", async () => {
    // Lo que hace que el índice sirva con lector de pantalla: el botón tiene
    // que decir de qué es, no sólo lo que vale. «Llamar al fontanero» a secas
    // no dice que tocándolo se cambia el título.
    const { getByRole } = render(
      <FichaDeRespuestas
        pasos={PASOS}
        respuestas={RESPUESTAS}
        etiquetas={{ title: "Qué", notes: "Nota" }}
        onIr={vi.fn()}
      />,
    );

    expect(getByRole("button", { name: /Qué[\s\S]*Llamar al fontanero/ })).toBeTruthy();
  });
});
