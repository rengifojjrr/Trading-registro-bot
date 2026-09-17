// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallosDeAccesibilidad } from "@/test-support/axe";

import { PieceSurvey } from "./piece-survey";
import type { PieceRow } from "@/modules/content/queries";

/**
 * Lo que tiene que cumplir la ficha de una pieza.
 *
 * Es el formulario más largo de la aplicación, así que es también donde más se
 * nota si la encuesta arregla rellenar y estropea corregir. Una pieza se toca
 * durante dos meses mientras baja por los diez estados: pegar el enlace del
 * montaje tiene que costar un toque.
 */

const guardados: { campo: string; valor: unknown }[] = [];
let fallo: string | null = null;

vi.mock("@/modules/content/actions", () => ({
  savePieceAnswer: async (_pieceId: string, campo: string, valor: unknown) => {
    guardados.push({ campo, valor });
    return { error: fallo, success: fallo === null };
  },
}));

const HOY = "2026-03-15";

function pieza(extra: Partial<PieceRow> = {}): PieceRow {
  return {
    id: "99999999-9999-8999-8999-999999999999",
    title: "Cómo leer velas",
    summary: null,
    channels: [],
    platforms: [],
    content_type: null,
    status: "IDEA",
    planned_date: null,
    published_at: null,
    has_script: false,
    is_edited: false,
    has_thumbnail_ab: false,
    record_difficulty: null,
    record_difficulties: [],
    record_minutes: null,
    edit_minutes: null,
    edit_time_uncapped: false,
    edit_styles: [],
    edit_notes: null,
    video_url: null,
    final_url: null,
    url: null,
    notes: null,
    body: null,
    icon: null,
    notion_page_id: null,
    ...extra,
  } as PieceRow;
}

/** Una pieza con todas las preguntas contestadas. */
function entera(extra: Partial<PieceRow> = {}): PieceRow {
  return pieza({
    summary: "Las tres velas de todo suelo",
    channels: ["PEKAS TRADING"],
    platforms: ["YT LONG"],
    content_type: "VIDEO",
    planned_date: "2026-03-16",
    has_script: true,
    is_edited: true,
    has_thumbnail_ab: true,
    record_difficulties: ["MEDIO"],
    record_minutes: 30,
    edit_minutes: 120,
    edit_styles: ["Sencilla"],
    edit_notes: "Cortar los primeros 40 segundos",
    video_url: "https://drive.test/material",
    final_url: "https://drive.test/montaje",
    url: "https://youtube.test/v",
    notes: "Salió larga",
    body: "**HOOK:** ¿Y si el suelo se ve venir?",
    ...extra,
  });
}

beforeEach(() => {
  guardados.length = 0;
  fallo = null;
});

describe("una idea recién apuntada", () => {
  it("abre en la primera pregunta sin contestar", () => {
    render(<PieceSurvey piece={pieza()} hoy={HOY} />);
    // El título y el estado vienen puestos al apuntarla, así que la primera
    // de verdad es el tipo.
    expect(screen.getByRole("heading", { name: "¿Vídeo o foto?" })).toBeTruthy();
  });

  it("cada respuesta se guarda al contestarla", async () => {
    const user = userEvent.setup();
    render(<PieceSurvey piece={pieza()} hoy={HOY} />);

    await user.click(screen.getByRole("button", { name: "Video" }));

    await waitFor(() => expect(guardados).toContainEqual({ campo: "content_type", valor: "VIDEO" }));
  });
});

describe("una pieza ya entera", () => {
  it("abre en su ficha, no en la primera pregunta", () => {
    render(<PieceSurvey piece={entera()} hoy={HOY} />);

    expect(screen.getByRole("heading", { name: "La pieza, entera" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "¿Sobre qué va?" })).toBeNull();
  });

  it("pegar el enlace del montaje cuesta un toque y no diecisiete", async () => {
    const user = userEvent.setup();
    render(<PieceSurvey piece={entera({ url: null })} hoy={HOY} />);

    // Sin el enlace publicado la pieza no está entera, así que abre en él.
    expect(screen.getByRole("heading", { name: "¿Dónde quedó publicada?" })).toBeTruthy();

    await user.type(screen.getByRole("textbox"), "https://youtube.test/nuevo");
    await user.click(screen.getByRole("button", { name: /Siguiente|Terminar/ }));

    await waitFor(() =>
      expect(guardados).toContainEqual({ campo: "url", valor: "https://youtube.test/nuevo" }),
    );
  });

  it("desde la ficha se salta a cualquier pregunta", async () => {
    const user = userEvent.setup();
    render(<PieceSurvey piece={entera()} hoy={HOY} />);

    await user.click(screen.getByRole("button", { name: /Estado/ }));

    expect(screen.getByRole("heading", { name: "¿Por dónde va?" })).toBeTruthy();
  });

  /**
   * El guion son hasta veinte mil caracteres. Sin recortar, una línea del
   * índice taparía el resto de la ficha.
   */
  it("el guion sale recortado en el índice, no entero", () => {
    const largo = "x".repeat(400);
    render(<PieceSurvey piece={entera({ body: largo })} hoy={HOY} />);

    expect(screen.queryByText(largo)).toBeNull();
    expect(screen.getByText(/^x+…$/)).toBeTruthy();
  });
});

describe("los hitos", () => {
  it("las tres casillas se contestan de una pasada", async () => {
    const user = userEvent.setup();
    render(<PieceSurvey piece={entera({ has_script: false, is_edited: false, has_thumbnail_ab: false })} hoy={HOY} />);

    // Sin ningún hito la pieza no está entera: abre justo en esa pregunta.
    expect(screen.getByRole("heading", { name: "¿Qué ya está hecho?" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Guion" }));
    await user.click(screen.getByRole("button", { name: "Editado" }));
    await user.click(screen.getByRole("button", { name: /Siguiente|Terminar/ }));

    await waitFor(() =>
      expect(guardados).toContainEqual({ campo: "hitos", valor: ["has_script", "is_edited"] }),
    );
  });
});

describe("un enlace que no vale", () => {
  it("se avisa, porque es lo único que puede fallar por lo que tecleas", async () => {
    const user = userEvent.setup();
    fallo = "El enlace no es válido.";
    render(<PieceSurvey piece={entera({ url: null })} hoy={HOY} />);

    await user.type(screen.getByRole("textbox"), "no-es-un-enlace");
    await user.click(screen.getByRole("button", { name: /Siguiente|Terminar/ }));

    // Llega al servidor, que es quien decide; lo que importa es que la
    // respuesta vuelve con error en vez de quedarse pegada en silencio.
    await waitFor(() => expect(guardados).toContainEqual({ campo: "url", valor: "no-es-un-enlace" }));
  });
});

describe("accesibilidad", () => {
  it("la ficha, con plantillas e icono, no tiene fallos que jsdom pueda ver", async () => {
    const { container } = render(<PieceSurvey piece={entera()} hoy={HOY} />);
    expect(await fallosDeAccesibilidad(container)).toEqual([]);
  });
});
