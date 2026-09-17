// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReadingSurvey } from "./reading-survey";
import type { BookRow, SessionRow } from "@/modules/reading/queries";

/**
 * Lo que tiene que cumplir la encuesta de lectura.
 *
 * La promesa es la de todas las demás: que apuntar el rato cueste menos que no
 * apuntarlo. Lo que se rompa aquí devuelve esto al sitio del que viene -- un
 * formulario de seis campos que se rellenaba las veces que uno tenía ganas.
 */

/** Cada guardado, que es por donde viaja una respuesta. */
const guardados: { sessionId: string | null; sessionDate: string; campo: string; valor: unknown }[] = [];

/** El id que el servidor devuelve al crear la fila con la primera respuesta. */
let idAsignado: string | null = "55555555-5555-8555-8555-555555555555";

vi.mock("@/modules/reading/actions", () => ({
  saveReadingAnswer: async (entrada: {
    sessionId: string | null;
    sessionDate: string;
    campo: string;
    valor: unknown;
  }) => {
    guardados.push(entrada);
    const vacia =
      entrada.valor === null ||
      entrada.valor === "" ||
      (Array.isArray(entrada.valor) && entrada.valor.length === 0);
    return {
      error: null,
      success: true,
      // Como el servidor de verdad: ni el día solo ni una respuesta vacía
      // crean fila, así que tampoco devuelven id.
      id: entrada.sessionId ?? (entrada.campo === "session_date" || vacia ? null : idAsignado),
    };
  },
}));

const HOY = "2026-03-15";

const LIBROS: BookRow[] = [
  {
    id: "11111111-1111-8111-8111-111111111111",
    title: "Meditaciones",
    author: "Marco Aurelio",
    genres: [],
    total_pages: 300,
    status: "LEYENDO",
    icon: null,
    pagesRead: 40,
  },
];

function sesion(extra: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "99999999-9999-8999-8999-999999999999",
    book_id: null,
    bookTitle: null,
    bookGenres: [],
    session_date: "2026-03-10",
    started_at: null,
    minutes: null,
    pages: null,
    score: null,
    summary: null,
    ...extra,
  };
}

beforeEach(() => {
  guardados.length = 0;
  idAsignado = "55555555-5555-8555-8555-555555555555";
});

describe("una pregunta a la vez", () => {
  it("empieza por el libro: el día ya viene contestado", () => {
    render(<ReadingSurvey date={HOY} books={LIBROS} />);
    expect(screen.getByRole("heading", { name: "¿Qué estabas leyendo?" })).toBeTruthy();
  });

  it("elegir el libro avanza solo, sin un segundo clic", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={LIBROS} />);

    await user.click(screen.getByRole("button", { name: /Meditaciones/ }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "¿Cuántos minutos?" })).toBeTruthy());
  });

  it("sin libros apuntados no abre con una pregunta imposible", () => {
    render(<ReadingSurvey date={HOY} books={[]} />);
    expect(screen.getByRole("heading", { name: "¿Cuántos minutos?" })).toBeTruthy();
  });

  it("corrigiendo una lectura vieja, empieza por el principio", () => {
    render(<ReadingSurvey date={HOY} books={LIBROS} session={sesion({ minutes: 20, pages: 10 })} />);
    expect(screen.getByRole("heading", { name: "¿Qué estabas leyendo?" })).toBeTruthy();
  });
});

describe("cada respuesta se guarda al contestarla", () => {
  it("el libro viaja en cuanto se toca", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={LIBROS} />);

    await user.click(screen.getByRole("button", { name: /Meditaciones/ }));

    await waitFor(() =>
      expect(guardados).toContainEqual({
        sessionId: null,
        sessionDate: HOY,
        campo: "book_id",
        valor: LIBROS[0].id,
      }),
    );
  });

  /**
   * El fallo que esta prueba existe para impedir: sin quedarse con el id que
   * devuelve la primera respuesta, cada pregunta crearía su propia lectura y
   * un rato de veinte minutos acabaría siendo seis lecturas vacías.
   */
  it("la primera respuesta crea la lectura y las demás escriben en ella", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={LIBROS} />);

    await user.click(screen.getByRole("button", { name: /Meditaciones/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "¿Cuántos minutos?" })).toBeTruthy());

    await user.type(screen.getByRole("textbox"), "20");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(guardados).toHaveLength(2));
    expect(guardados[0].sessionId).toBeNull();
    expect(guardados[1]).toMatchObject({ sessionId: idAsignado, campo: "minutes", valor: 20 });
  });

  it("los minutos viajan como número, no como el texto que tecleaste", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} />);

    await user.type(screen.getByRole("textbox"), "35");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(guardados).toContainEqual({
      sessionId: null,
      sessionDate: HOY,
      campo: "minutes",
      valor: 35,
    }));
  });

  it("corrigiendo, escribe sobre la lectura que ya existe", async () => {
    const user = userEvent.setup();
    const vieja = sesion();
    render(<ReadingSurvey date={HOY} books={LIBROS} session={vieja} />);

    await user.click(screen.getByRole("button", { name: /Meditaciones/ }));

    await waitFor(() => expect(guardados[0]).toMatchObject({ sessionId: vieja.id }));
    // Y con su día, no con el de hoy: corregir el libro no mueve la lectura.
    expect(guardados[0].sessionDate).toBe("2026-03-10");
  });
});

describe("el día", () => {
  it("viene puesto hoy, para que apuntar lo de siempre no cueste un toque más", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} />);

    while (screen.queryByRole("heading", { name: "¿Qué día fue?" }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }

    expect(screen.getByRole("button", { name: "Hoy" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("se puede mover a ayer, que es la lectura que se te olvidó apuntar", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} />);

    while (screen.queryByRole("heading", { name: "¿Qué día fue?" }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }
    await user.click(screen.getByRole("button", { name: "Ayer" }));
    // Elegir el día no avanza solo, igual que no lo hace elegir una hora: el
    // campo de al lado deja teclear otra fecha, y avanzar al tocar el atajo
    // dejaría a medias a quien iba a escribirla.
    await user.click(screen.getByRole("button", { name: /Siguiente|Terminar/ }));

    await waitFor(() =>
      expect(guardados).toContainEqual({
        sessionId: null,
        sessionDate: "2026-03-14",
        campo: "session_date",
        valor: "2026-03-14",
      }),
    );
  });
});

describe("el ritmo en vivo", () => {
  it("aparece en cuanto están los minutos y las páginas", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} />);

    await user.type(screen.getByRole("textbox"), "30");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "¿Cuántas páginas?" })).toBeTruthy());
    await user.type(screen.getByRole("textbox"), "24");

    // 24 páginas en media hora son 48 por hora, y verlo ahí mismo es lo que
    // hace que el número signifique algo.
    await waitFor(() => expect(screen.getByText(/48 pág\/h/)).toBeTruthy());
  });

  it("con menos de diez minutos no inventa un ritmo", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} />);

    await user.type(screen.getByRole("textbox"), "5");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "¿Cuántas páginas?" })).toBeTruthy());
    await user.type(screen.getByRole("textbox"), "9");

    expect(screen.queryByText(/pág\/h/)).toBeNull();
  });
});

describe("al acabar", () => {
  it("deja apuntar otra: de lecturas hay varias el mismo día", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} />);

    await user.type(screen.getByRole("textbox"), "30");
    while (screen.queryByRole("button", { name: "Apuntar otra lectura" }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }
    expect(screen.getByText("30")).toBeTruthy();

    idAsignado = "77777777-7777-8777-8777-777777777777";
    await user.click(screen.getByRole("button", { name: "Apuntar otra lectura" }));

    // Vuelve a empezar de cero: si arrastrara el id, la segunda lectura
    // escribiría encima de la primera en vez de ser otra.
    expect(screen.getByRole("heading", { name: "¿Cuántos minutos?" })).toBeTruthy();
    await user.type(screen.getByRole("textbox"), "15");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() =>
      expect(guardados.at(-1)).toMatchObject({ sessionId: null, campo: "minutes", valor: 15 }),
    );
  });

  it("corrigiendo una lectura vieja no ofrece apuntar otra", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} session={sesion({ minutes: 20 })} />);

    while (screen.queryByRole("heading", { name: /Lectura guardada/ }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }

    expect(screen.queryByRole("button", { name: "Apuntar otra lectura" })).toBeNull();
  });

  it("sin contestar nada no finge una lectura", async () => {
    const user = userEvent.setup();
    render(<ReadingSurvey date={HOY} books={[]} />);

    while (screen.queryByRole("heading", { name: "Otro día será" }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }

    // Ninguna respuesta llegó a crear fila, así que la encuesta nunca tuvo id
    // que arrastrar. El día viene contestado de serie y saltar manda un
    // guardado vacío, y ni uno ni otro son una lectura.
    expect(guardados.every((g) => g.sessionId === null)).toBe(true);
  });
});
