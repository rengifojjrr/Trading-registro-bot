"use client";

import { Palette } from "lucide-react";
import { useState } from "react";

import { AppearancePanel } from "@/components/layout/appearance-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Appearance } from "@/lib/appearance/catalog";

/**
 * El acceso desde la barra de arriba.
 *
 * La apariencia no es una decisión institucional: es de quien mira, no
 * afecta a nadie más y no necesita permisos. Por eso no puede vivir sólo
 * dentro de Configuración, que es donde están las cosas que sí cambian cómo
 * funciona la aplicación -- está aquí, a un clic desde cualquier pantalla y
 * también en el móvil, donde la barra lateral ni siquiera se ve.
 *
 * Sustituye al interruptor de claro/oscuro que había antes. Aquel resolvía
 * uno de los cinco ejes y mezclaba dos decisiones -- el contraste y la
 * paleta -- en un solo botón.
 */
export function AppearanceLauncher({ appearance }: { appearance: Appearance }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Apariencia">
        <Palette className="size-4" />
      </Button>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetTitle className="px-5 pt-5 text-base">Apariencia</SheetTitle>
        <div className="px-5 pb-6">
          <AppearancePanel appearance={appearance} compact />
        </div>
      </SheetContent>
    </Sheet>
  );
}
