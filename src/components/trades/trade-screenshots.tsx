"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { deleteTradeScreenshot, uploadTradeScreenshot, type ScreenshotFormState } from "@/app/(dashboard)/trades/[tradeId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface TradeScreenshotRow {
  id: string;
  url: string; // pre-signed (private bucket) -- generated server-side, short-lived
  caption: string | null;
  phase: "BEFORE" | "AFTER" | "OTHER" | null;
  storagePath: string;
}

const PHASE_LABELS: Record<"BEFORE" | "AFTER" | "OTHER", string> = {
  BEFORE: "Antes",
  AFTER: "Después",
  OTHER: "Otro",
};

const initialState: ScreenshotFormState = { error: null, success: false };

/**
 * Chart screenshots attached to a trade -- e.g. what the setup looked like
 * before entering, or the outcome afterward. Stored in the private
 * `trade-screenshots` bucket (never public); pages render <img> tags off
 * short-lived signed URLs generated server-side per request, not off a
 * long-lived or public link.
 */
export function TradeScreenshots({ tradeId, screenshots }: { tradeId: string; screenshots: TradeScreenshotRow[] }) {
  const [state, formAction, pending] = useActionState(uploadTradeScreenshot, initialState);

  useEffect(() => {
    if (state.success) toast.success("Captura subida.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capturas de pantalla</CardTitle>
        <CardDescription>
          Gráficos guardados al momento de operar -- antes, después, o cualquier otra referencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {screenshots.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {screenshots.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-md border border-border">
                <a href={s.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private Storage, not an optimizable static asset */}
                  <img
                    src={s.url}
                    alt={s.caption ?? "Captura de la operación"}
                    className="aspect-video w-full object-cover"
                  />
                </a>
                <div className="flex items-start justify-between gap-1 p-2">
                  <div className="min-w-0">
                    {s.phase ? (
                      <Badge variant="outline" className="mb-1">
                        {PHASE_LABELS[s.phase]}
                      </Badge>
                    ) : null}
                    {s.caption ? <p className="truncate text-xs text-muted-foreground">{s.caption}</p> : null}
                  </div>
                  <form action={deleteTradeScreenshot.bind(null, tradeId, s.id, s.storagePath)}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        if (!window.confirm("¿Eliminar esta captura?")) e.preventDefault();
                      }}
                    >
                      Eliminar
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay capturas en esta operación.</p>
        )}

        <form
          key={screenshots.length}
          action={formAction}
          className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="tradeId" value={tradeId} />

          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="screenshot-file">Imagen (PNG, JPG o WEBP, máx. 5 MB)</Label>
            <Input
              id="screenshot-file"
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="screenshot-phase">Momento</Label>
            <Select name="phase" defaultValue="OTHER">
              <SelectTrigger id="screenshot-phase" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BEFORE">Antes</SelectItem>
                <SelectItem value="AFTER">Después</SelectItem>
                <SelectItem value="OTHER">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="screenshot-caption">Descripción (opcional)</Label>
            <Input id="screenshot-caption" name="caption" placeholder="p. ej. ruptura de resistencia diaria" />
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Subiendo…" : "Subir captura"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
