"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setNotionFieldMappingEnabled } from "@/app/(dashboard)/settings/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export interface FieldMappingState {
  internalField: string;
  notionPropertyName: string;
  label: string;
  enabled: boolean;
}

/**
 * Per-field on/off switches for the Notion outbound mirror -- only controls
 * *whether* a field syncs (via notion_field_mappings.enabled, which
 * lib/notion/sync.ts already reads). The target Notion property name is
 * shown for transparency but isn't editable here: it's a hardcoded literal
 * inside lib/notion/mapper.ts's buildNotionProperties, and letting it be
 * renamed from this UI would risk a typo silently breaking that field (a
 * property name Notion doesn't recognize is just dropped, not an error).
 */
export function NotionFieldMappings({ mappings }: { mappings: FieldMappingState[] }) {
  const [state, setState] = useState(mappings);
  const [, startTransition] = useTransition();

  function toggle(internalField: string, next: boolean) {
    setState((prev) => prev.map((m) => (m.internalField === internalField ? { ...m, enabled: next } : m)));
    startTransition(async () => {
      try {
        await setNotionFieldMappingEnabled(internalField, next);
      } catch {
        toast.error("No se pudo guardar el cambio.");
        setState((prev) => prev.map((m) => (m.internalField === internalField ? { ...m, enabled: !next } : m)));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campos sincronizados a Notion</CardTitle>
        <CardDescription>
          Desactiva un campo para que nunca se envíe a Notion, sin afectar el resto del espejo. Solo tiene efecto si
          el espejo de Notion está activado arriba.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {state.map((m) => (
          <div key={m.internalField} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div>
              <p>{m.label}</p>
              <p className="text-xs text-muted-foreground">Notion: {m.notionPropertyName.trim()}</p>
            </div>
            <Switch
              checked={m.enabled}
              onCheckedChange={(next) => toggle(m.internalField, next)}
              aria-label={`Sincronizar "${m.label}" a Notion`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
