"use client";

import { FileSignature, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { setBaselineFromHistory, signDrawdownContract } from "@/app/(dashboard)/bots/actions";
import { Button } from "@/components/ui/button";

/** Firmar el contrato de drawdown con la cifra del Monte Carlo. */
export function SignContractButton({ botId, pct, resign }: { botId: string; pct: number; resign: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function firmar() {
    startTransition(async () => {
      const r = await signDrawdownContract({ botId, pct });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Contrato firmado: ${pct.toFixed(1)}% de drawdown.`, {
        description: "Superarlo ya no es mala suerte.",
      });
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant={resign ? "outline" : "default"} onClick={firmar} disabled={isPending}>
      <FileSignature className="size-4" aria-hidden />
      {isPending ? "Firmando…" : resign ? `Volver a firmar al ${pct.toFixed(1)}%` : `Firmar al ${pct.toFixed(1)}%`}
    </Button>
  );
}

/** Tomar el histórico como línea base, para un bot que llegó sin backtest. */
export function BaselineFromHistoryButton({ botId, trades }: { botId: string; trades: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function tomar() {
    startTransition(async () => {
      const r = await setBaselineFromHistory(botId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Línea base tomada del histórico.");
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={tomar} disabled={isPending || trades < 10}>
      <History className="size-4" aria-hidden />
      {isPending ? "Tomando…" : "Tomar el histórico como línea base"}
    </Button>
  );
}
