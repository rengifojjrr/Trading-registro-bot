"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { assignTradesToBot } from "@/app/(dashboard)/bots/actions";
import { NativeSelect } from "@/components/bots/native-select";
import { Button } from "@/components/ui/button";

/**
 * Decir qué bot abrió las operaciones marcadas.
 *
 * Va en la barra de selección de la tabla, al lado de «Apuntar»: asignar
 * las operaciones de la semana a su bot es el punto tres de la revisión
 * técnica del domingo, y hacerlo de veinte en veinte es lo que lo hace
 * posible.
 */
export function AssignToBot({
  tradeIds,
  bots,
  onDone,
}: {
  tradeIds: string[];
  bots: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [botId, setBotId] = useState(bots[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  if (bots.length === 0) {
    return (
      <Link href="/bots/nuevo" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
        <Bot className="size-3.5" aria-hidden />
        Crear un bot para asignarlas
      </Link>
    );
  }

  function asignar(target: string | null) {
    startTransition(async () => {
      const r = await assignTradesToBot({ tradeIds, botId: target });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const cuantas = `${r.assigned} operaci${r.assigned === 1 ? "ón" : "ones"}`;
      toast.success(
        target
          ? `${cuantas} asignada${r.assigned === 1 ? "" : "s"} a ${bots.find((b) => b.id === target)?.name ?? "su bot"}.`
          : `${cuantas} sin bot.`,
      );
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <NativeSelect aria-label="Bot" className="h-8 w-auto text-xs" value={botId} onChange={(e) => setBotId(e.target.value)}>
        {bots.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
      <Button size="sm" variant="outline" onClick={() => asignar(botId)} disabled={isPending || !botId}>
        <Bot className="size-4" aria-hidden />
        {isPending ? "Asignando…" : "Asignar al bot"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => asignar(null)} disabled={isPending}>
        Quitar bot
      </Button>
    </div>
  );
}
