"use client";

import { BookOpen, CircleCheck, Moon, TrendingUp, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/**
 * Registrar desde «Hoy» sin cambiar de pantalla.
 *
 * El registro rápido eran cinco enlaces: cada uno te sacaba de Hoy, te llevaba
 * a un formulario y te dejaba allí. Para «dormí 7 h» eso son tres pantallas y
 * dos vueltas atrás -- y lo que se hace veinte veces al día es donde un segundo
 * de más cuesta caro.
 *
 * Los dos que se pueden apuntar con un número --sueño y lectura-- se apuntan
 * aquí, en un panel que se abre encima y se cierra. Los demás siguen llevando
 * a su pantalla, y a propósito: una comida son varios ingredientes y una
 * operación es una decisión con contexto. Meter aquí un formulario de cinco
 * campos sería mover la fricción, no quitarla.
 */
interface Rapido {
  href: string;
  label: string;
  icon: LucideIcon;
  colorToken: string;
  /** Lo que se puede apuntar aquí mismo, con un número. */
  inline?: {
    titulo: string;
    campo: string;
    unidad: string;
    /** El decimal más pequeño que tiene sentido para este dato. */
    paso: number;
    max: number;
    action: (valor: number) => Promise<{ error: string | null }>;
  };
}

export function QuickLogSheet({
  acciones,
}: {
  acciones: {
    sueno: (horas: number) => Promise<{ error: string | null }>;
    lectura: (minutos: number) => Promise<{ error: string | null }>;
  };
}) {
  const [abierto, setAbierto] = useState<Rapido | null>(null);

  const items: Rapido[] = [
    // Trading va primero: lleva al Diario y no a Operaciones porque las
    // operaciones las registra la sincronización sola -- lo que hace falta
    // poner a mano es lo que pensabas.
    { href: "/journal", label: "Operé", icon: TrendingUp, colorToken: "--mod-trading" },
    {
      href: "/sueno",
      label: "Dormí",
      icon: Moon,
      colorToken: "--mod-sleep",
      inline: {
        titulo: "¿Cuánto dormiste?",
        campo: "Horas",
        unidad: "h",
        paso: 0.25,
        max: 24,
        action: acciones.sueno,
      },
    },
    {
      href: "/lecturas",
      label: "Leí",
      icon: BookOpen,
      colorToken: "--mod-reading",
      inline: {
        titulo: "¿Cuánto leíste?",
        campo: "Minutos",
        unidad: "min",
        paso: 5,
        max: 1440,
        action: acciones.lectura,
      },
    },
    { href: "/comidas", label: "Comí", icon: UtensilsCrossed, colorToken: "--mod-meals" },
    { href: "/habitos", label: "Hábitos", icon: CircleCheck, colorToken: "--mod-habits" },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const clases =
            "flex min-w-20 flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-3 py-4 transition-colors hover:border-foreground/25 sm:flex-none sm:px-6";

          if (!item.inline) {
            return (
              <Link key={item.href} href={item.href} className={clases}>
                <Icon className="size-5" style={{ color: `var(${item.colorToken})` }} aria-hidden />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          }

          return (
            <button
              key={item.href}
              type="button"
              onClick={() => setAbierto(item)}
              className={clases}
            >
              <Icon className="size-5" style={{ color: `var(${item.colorToken})` }} aria-hidden />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>

      <Sheet open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <SheetContent side="bottom" className="max-h-[80svh]">
          {abierto?.inline ? (
            <InlineForm
              titulo={abierto.inline.titulo}
              campo={abierto.inline.campo}
              unidad={abierto.inline.unidad}
              paso={abierto.inline.paso}
              max={abierto.inline.max}
              href={abierto.href}
              action={abierto.inline.action}
              onDone={() => setAbierto(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function InlineForm({
  titulo,
  campo,
  unidad,
  paso,
  max,
  href,
  action,
  onDone,
}: {
  titulo: string;
  campo: string;
  unidad: string;
  paso: number;
  max: number;
  href: string;
  action: (valor: number) => Promise<{ error: string | null }>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [pendiente, startTransition] = useTransition();

  function guardar() {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0 || numero > max) {
      toast.error(`Pon un número entre 0 y ${max}.`);
      return;
    }

    startTransition(async () => {
      const res = await action(numero);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Apuntado.");
      onDone();
      // La tarjeta del módulo en «Hoy» tiene que reflejarlo al momento: es la
      // confirmación de verdad, más que el aviso.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <SheetTitle className="text-base">{titulo}</SheetTitle>

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="quick-valor" className="text-xs">
            {campo}
          </Label>
          <Input
            id="quick-valor"
            type="number"
            inputMode="decimal"
            step={paso}
            min={0}
            max={max}
            value={valor}
            autoFocus
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              // Enter guarda: en el móvil el teclado ofrece «hecho» y nadie
              // busca el botón después de escribir un número.
              if (e.key === "Enter") guardar();
            }}
            placeholder={unidad}
            className="h-10 text-base"
          />
        </div>
        <Button onClick={guardar} disabled={pendiente} className="h-10">
          {pendiente ? "Guardando…" : "Apuntar"}
        </Button>
      </div>

      {/* La pantalla completa sigue a un toque: aquí sólo cabe el número, y
          la nota o la puntuación se ponen allí. */}
      <Link
        href={href}
        className="text-xs text-muted-foreground underline underline-offset-4"
        onClick={onDone}
      >
        Apuntar con más detalle
      </Link>
    </div>
  );
}
