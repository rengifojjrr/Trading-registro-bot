"use client";

import { Check, X } from "lucide-react";
import { useTransition } from "react";

import { dismissNotification, markAllNotificationsRead, markNotificationRead } from "@/app/(dashboard)/activity/actions";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface NotificationRow {
  id: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const SEVERITY_LABELS: Record<NotificationRow["severity"], string> = {
  INFO: "Informativo",
  WARNING: "Advertencia",
  CRITICAL: "Crítico",
};

const SEVERITY_VARIANTS: Record<NotificationRow["severity"], "default" | "warning" | "negative"> = {
  INFO: "default",
  WARNING: "warning",
  CRITICAL: "negative",
};

/**
 * Notifications with a way to acknowledge them. Read ones stay visible but
 * visually recede rather than disappearing, so acknowledging a warning
 * never destroys the record of it having happened.
 */
export function NotificationsList({
  notifications,
  timezone,
}: {
  notifications: NotificationRow[];
  timezone: string;
}) {
  const [isPending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (notifications.length === 0) {
    return (
      <EmptyState
        title="Sin notificaciones"
        description="Aquí aparecerán fallos repetidos de sincronización, diferencias frente a Coinbase o cálculos que no se pudieron verificar."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {unreadCount > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {unreadCount} sin leer de {notifications.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => markAllNotificationsRead())}
          >
            Marcar todas como leídas
          </Button>
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-border">
        {notifications.map((n) => (
          <li key={n.id} className={cn("flex items-start justify-between gap-3 py-2.5", n.is_read && "opacity-55")}>
            <div className="flex min-w-0 flex-col gap-0.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY_VARIANTS[n.severity]}>{SEVERITY_LABELS[n.severity]}</Badge>
                <span className="font-medium text-foreground">{n.title}</span>
              </div>
              <p className="text-muted-foreground">{n.message}</p>
              <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at, timezone)}</span>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              {n.is_read ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Marcar "${n.title}" como leída`}
                  disabled={isPending}
                  onClick={() => startTransition(() => markNotificationRead(n.id))}
                >
                  <Check className="size-4" aria-hidden />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Descartar "${n.title}"`}
                disabled={isPending}
                onClick={() => startTransition(() => dismissNotification(n.id))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
