"use client";

import { useEffect } from "react";

import { rememberList, type ListReturn } from "@/components/shared/back-to-list";

/**
 * Deja la miga de pan desde una página de servidor.
 *
 * `rememberList` escribe en `sessionStorage`, que sólo existe en el navegador,
 * así que una lista renderizada en el servidor no puede llamarlo por su cuenta.
 * Esto es esa llamada y nada más: no pinta nada.
 *
 * Es lo que hace que entrar en una operación desde la ficha de un día y volver
 * lleve al día, y no a la lista general de operaciones.
 */
export function RememberList({ href, label }: ListReturn) {
  useEffect(() => {
    rememberList({ href, label });
  }, [href, label]);

  return null;
}
