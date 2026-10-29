'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActor } from '@/lib/actor-context';
import type { AppNotification } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import {
  ApiError,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

/** Frecuencia de actualización del contador (ms). */
const POLL_MS = 60_000;

/**
 * Centro de notificaciones (NOT-01): campana con el contador de no leídas,
 * lista desplegable, marcar como leída (una o todas) y navegación directa al
 * elemento relacionado. Se actualiza al abrir, cada minuto y al volver a la
 * pestaña. Solo muestra las notificaciones del usuario actual (lo garantiza el
 * backend).
 */
export function NotificationBell({ className }: { className?: string }): React.ReactElement | null {
  const router = useRouter();
  const { permissions, actorId } = useActor();
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const signedIn = permissions !== null;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await listNotifications(20);
      setItems(data.items);
      setUnread(data.unreadCount);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible cargar las notificaciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!signedIn) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, actorId, load]);

  if (!signedIn) return null;

  async function open(item: AppNotification): Promise<void> {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await markNotificationRead(item.id);
      } catch {
        /* Se reintenta en la próxima actualización. */
      }
    }
    if (item.link) router.push(item.link);
  }

  async function readAll(): Promise<void> {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No fue posible marcar las notificaciones.');
    }
  }

  const label =
    unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones: no hay pendientes';

  return (
    <DropdownMenu onOpenChange={(isOpen) => (isOpen ? void load() : undefined)}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn('relative', className)}
        >
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <DropdownMenuLabel className="px-0">Notificaciones</DropdownMenuLabel>
          {unread > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void readAll()}>
              <CheckCheck aria-hidden="true" />
              Marcar todas como leídas
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto" aria-busy={loading || undefined}>
          {error ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {loading ? 'Cargando…' : 'No tienes notificaciones.'}
            </p>
          ) : (
            items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="items-start"
                onSelect={() => void open(n)}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    n.read ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn('text-sm', !n.read && 'font-semibold')}>
                    {n.title}
                    {!n.read ? <span className="sr-only"> (sin leer)</span> : null}
                  </span>
                  <span className="text-meta text-muted-foreground wrap-break-word">{n.message}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
