/**
 * La regla que decide si se puede encender la sincronización automática.
 *
 * Antes pedía **veinte operaciones revisadas a mano** contra Coinbase, sin
 * ninguna diferencia. La intención era buena -- no confiar en cifras
 * automáticas hasta comprobarlas -- pero en la práctica hizo lo contrario de
 * lo que buscaba: nadie tecleó veinte revisiones, la puerta nunca se abrió, la
 * sincronización automática nunca se encendió, la conciliación diaria nunca
 * corrió, y la aplicación pasó ocho días enseñando una posición fantasma de
 * 151 contratos que no existía. La comprobación pensada para evitar cifras
 * falsas fue la razón de que nadie las detectara.
 *
 * Ahora la puerta se abre con **pruebas que la propia aplicación produce**, y
 * son más fuertes que el recuento manual:
 *
 * - la posición reconstruida coincide con la que Coinbase reporta,
 * - ninguna orden tiene fills sin registrar,
 * - y ninguna revisión manual quedó marcada como distinta.
 *
 * Veinte comparaciones puntuales de hace un mes no dicen nada de lo que pasó
 * anoche. Estas tres se rehacen en cada sincronización, así que la puerta no
 * sólo se abre: se vuelve a cerrar sola si algo deja de cuadrar. Las
 * revisiones a mano siguen contando -- una diferencia apuntada bloquea -- pero
 * ya no hay una cuota que cumplir antes de que la aplicación pueda cuidarse.
 */

export interface GateEvidence {
  /** Revisiones a mano marcadas como distintas a Coinbase. Cualquiera bloquea. */
  manualMismatches: number;
  /** Revisiones a mano confirmadas. Informativas: ya no hay cuota. */
  manualMatches: number;
  /**
   * Cómo fue la última comparación de posición contra Coinbase.
   * `null` cuando nunca se ha podido preguntar (sin credenciales, o el venue
   * no expone posiciones).
   */
  positionCheck: { matched: boolean } | null;
  /** Órdenes cuyos fills guardados no cuadran con lo que Coinbase dice. */
  fillGaps: number;
  /** Si ha habido al menos una sincronización que terminara bien. */
  hasSyncedSuccessfully: boolean;
}

export interface GateResult {
  canEnable: boolean;
  /** Por qué no, en el idioma del usuario. Null cuando la puerta está abierta. */
  blockedReason: string | null;
  /** Las pruebas, una a una, para poder enseñarlas como lista de comprobación. */
  checks: { label: string; passed: boolean; detail: string }[];
}

export function evaluateValidationGate(evidence: GateEvidence): GateResult {
  const checks: GateResult["checks"] = [
    {
      label: "Ha sincronizado con Coinbase al menos una vez",
      passed: evidence.hasSyncedSuccessfully,
      detail: evidence.hasSyncedSuccessfully
        ? "Hay al menos una sincronización terminada correctamente."
        : "Todavía no ha habido ninguna sincronización que terminara bien.",
    },
    {
      label: "No falta ninguna ejecución por registrar",
      passed: evidence.fillGaps === 0,
      detail:
        evidence.fillGaps === 0
          ? "Cada orden de Coinbase cuadra con los fills guardados."
          : `${evidence.fillGaps} orden(es) se ejecutaron por más de lo que tenemos guardado. Mientras falte un fill, la posición reconstruida no puede cuadrar.`,
    },
    {
      label: "La posición coincide con la que reporta Coinbase",
      passed: evidence.positionCheck?.matched === true,
      detail:
        evidence.positionCheck === null
          ? "Todavía no se ha podido comparar la posición con Coinbase."
          : evidence.positionCheck.matched
            ? "Los contratos abiertos que calcula la aplicación son los que dice Coinbase."
            : "Lo que la aplicación cree abierto no es lo que dice Coinbase.",
    },
    {
      label: "Ninguna revisión a mano quedó marcada como distinta",
      passed: evidence.manualMismatches === 0,
      detail:
        evidence.manualMismatches === 0
          ? evidence.manualMatches > 0
            ? `${evidence.manualMatches} operación(es) revisadas a mano, todas coinciden.`
            : "No hay ninguna diferencia apuntada."
          : `Hay ${evidence.manualMismatches} operación(es) marcadas como diferentes a Coinbase.`,
    },
  ];

  const fallida = checks.find((c) => !c.passed);

  return {
    canEnable: fallida === undefined,
    blockedReason: fallida ? fallida.detail : null,
    checks,
  };
}
