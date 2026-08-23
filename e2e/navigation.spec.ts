import { expect, expectNoHorizontalOverflow, test, skipWithoutCredentials } from "./support/fixtures";

/**
 * Every page, loaded for real, at both widths.
 *
 * This is the cheapest test in the suite and historically the one that
 * catches the most: a page that throws during server rendering looks fine
 * in unit tests and fails the moment it meets a real database row.
 */
const PAGES = [
  { path: "/", heading: /dashboard/i },
  { path: "/trades", heading: /operaciones/i },
  { path: "/journal", heading: /diario/i },
  { path: "/analytics", heading: /análisis/i },
  { path: "/behaviour", heading: /comportamiento/i },
  { path: "/review", heading: /revisión/i },
  { path: "/risk", heading: /riesgo/i },
  { path: "/strategies", heading: /estrategias/i },
  { path: "/reports", heading: /reportes/i },
  { path: "/validation", heading: /validación/i },
  { path: "/reconciliation", heading: /conciliación/i },
  { path: "/import", heading: /importar/i },
  { path: "/activity", heading: /actividad/i },
  { path: "/papelera", heading: /papelera/i },
  { path: "/settings", heading: /configuración/i },
  // Los módulos de vida. Se quedaron fuera de esta lista durante meses, que
  // es exactamente por qué merecen estar: la mitad de la aplicación no tenía
  // ni siquiera la prueba de que sus páginas cargan.
  //
  // Los títulos son los reales, no los que uno esperaría: /tareas encabeza
  // «Hoy» y /comidas «Registrar comida». Ponerlos a ojo dejaría la prueba
  // roja sin que nada estuviera roto, y una prueba que falla siempre deja de
  // leerse. (`/dia` no está: solo existe `/dia/[fecha]`.)
  { path: "/sueno", heading: /registrar sueño/i },
  { path: "/habitos", heading: /hábitos/i },
  { path: "/tareas", heading: /hoy/i },
  { path: "/comidas", heading: /registrar comida/i },
  { path: "/lecturas", heading: /registrar lectura/i },
  { path: "/contenido", heading: /contenido/i },
];

skipWithoutCredentials();

test.describe("navegación", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} carga sin errores`, async ({ signedIn }) => {
      const pageErrors: string[] = [];
      signedIn.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await signedIn.goto(path);
      expect(response?.status(), `${path} debe responder 200`).toBe(200);

      await expect(signedIn.getByRole("heading", { name: heading }).first()).toBeVisible();
      await expectNoHorizontalOverflow(signedIn);

      expect(pageErrors, `${path} no debe lanzar errores de JavaScript`).toEqual([]);
    });
  }

  test("una cuenta nueva ve estados vacíos, no cifras inventadas", async ({ signedIn }) => {
    await signedIn.goto("/trades");

    // The point of this assertion: an empty account must never render a
    // placeholder number that could be mistaken for a real result.
    await expect(signedIn.getByText(/Todavía no hay operaciones reconstruidas/).first()).toBeVisible();
  });
});
