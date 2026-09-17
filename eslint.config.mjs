import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Los módulos de Vida. Debe coincidir con src/core/registry.ts.
 *
 * Duplicado a propósito: la configuración de ESLint se carga fuera del
 * pipeline de TypeScript y no puede importar del código de la aplicación
 * sin arrastrar un transpilador. Es una lista de siete cadenas; el coste de
 * mantenerla sincronizada es menor que el de la alternativa.
 */
const MODULE_IDS = ["trading", "sleep", "habits", "reading", "tasks", "meals", "content"];

/**
 * Las fechas se importan de `@/lib/fecha`, nunca de `luxon`.
 *
 * `@/lib/fecha` es luxon con `Settings.defaultLocale = "es"` puesto. Sin eso
 * luxon usa el idioma de la máquina --`en-US` en este servidor-- y la
 * aplicación escribe «Jan», «Apr», «Aug», «Dec»; peor aún, escribe una cosa en
 * el servidor y otra en el navegador de quien la abra.
 *
 * Se arregla importando de un sitio que ya lo tiene puesto, y esta regla es lo
 * que hace que ese sitio sea el único. Quince ficheros se acordaban de llamar
 * a `.setLocale("es")` y cuatro no; recordarlo no es un mecanismo.
 *
 * Va repetida en cada bloque de `no-restricted-imports` porque ESLint no
 * acumula la configuración de una regla: el bloque más específico sustituye al
 * general, así que un módulo que sólo tuviera su regla de fronteras se quedaría
 * sin ésta.
 */
const SIN_LUXON = {
  name: "luxon",
  message:
    'Importa de "@/lib/fecha", que es luxon con el idioma puesto. Importar luxon directamente devuelve fechas en el idioma de la máquina.',
};

/**
 * Un módulo puede importar de @/core, de @/components y de @/lib.
 * De otro módulo, nunca.
 *
 * La promesa de que un módulo se puede arrancar y regalar sólo vale si es
 * mecánicamente imposible romperla. Mantenerla "con disciplina" falla
 * siempre: a los tres meses alguien importa una función de trading desde
 * lecturas porque le venía bien, y ya no queda separación que extraer.
 *
 * Se genera un bloque por módulo listando sólo los ajenos, porque una regla
 * genérica sobre @/modules/* también bloquearía que un módulo se importe a
 * sí mismo, que es exactamente lo que sí debe poder hacer.
 */
const moduleBoundaries = MODULE_IDS.map((id) => ({
  files: [`src/modules/${id}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [SIN_LUXON],
        patterns: MODULE_IDS.filter((other) => other !== id).map((other) => ({
          group: [`@/modules/${other}`, `@/modules/${other}/**`],
          message: `El módulo "${id}" no puede importar de "${other}". Si hay algo que compartir, súbelo a @/core.`,
        })),
      },
    ],
  },
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Adapter stubs (lib/coinbase/venues/{cfm,intx}.ts) intentionally
      // implement an interface with unused params until Phase 2.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": ["error", { paths: [SIN_LUXON] }],
    },
  },
  {
    // El único sitio que puede importar luxon: es el que le pone el idioma.
    files: ["src/lib/fecha.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  ...moduleBoundaries,
  {
    // El núcleo no puede depender de un módulo: si lo hiciera, dejarían de
    // poder extraerse por separado -- el núcleo se iría con ellos.
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [SIN_LUXON],
          patterns: [
            {
              group: ["@/modules/*", "@/modules/*/**"],
              message: "El núcleo no puede depender de un módulo.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
