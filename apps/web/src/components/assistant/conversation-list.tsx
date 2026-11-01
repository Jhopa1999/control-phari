'use client';

import * as React from 'react';
import Link from 'next/link';
import { MessageSquare, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { groupConversations } from '@/lib/assistant-format';
import type { ConversationSummary } from '@/lib/assistant';
import { cn } from '@/lib/utils';
import { useAssistant } from './assistant-provider';

export interface ConversationListProps {
  activeId?: string | null;
  /** Si se da, cada fila es un enlace (página); si no, un botón (panel). */
  hrefFor?: (id: string) => string;
  onOpen?: (id: string) => void;
  /** Se llama tras eliminar, para que la vista decida a dónde ir. */
  onDeleted?: (id: string) => void;
  /** Destino del foco si no queda ninguna fila al eliminar. */
  fallbackFocus?: () => HTMLElement | null;
  className?: string;
}

const TIME = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' });
const DATE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

function whenLabel(iso: string, groupId: string): string {
  const date = new Date(iso);
  if (groupId === 'hoy') return TIME.format(date);
  if (groupId === 'ayer') return 'ayer';
  return DATE.format(date);
}

/**
 * Historial de conversaciones agrupado por fecha. Solo se puede abrir y
 * eliminar (con confirmación). Carga la lista al montarse.
 */
export function ConversationList({
  activeId,
  hrefFor,
  onOpen,
  onDeleted,
  fallbackFocus,
  className,
}: ConversationListProps): React.ReactElement {
  const { history } = useAssistant();
  const { reload } = history;
  const [pending, setPending] = React.useState<ConversationSummary | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const groups = groupConversations(history.items);

  if (history.loading && history.items.length === 0) {
    return (
      <div role="status" aria-busy="true" className={cn('flex flex-col gap-2 p-2', className)}>
        <span className="sr-only">Cargando conversaciones…</span>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (history.error && history.items.length === 0) {
    return (
      <ErrorState
        size="compact"
        title="No fue posible cargar las conversaciones."
        onRetry={reload}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={MessageSquare}
        title="Aún no tienes conversaciones."
        description="Cuando le preguntes algo al asistente, aparecerá aquí."
      />
    );
  }

  const confirmDelete = async (): Promise<void> => {
    if (!pending) return;
    const target = pending;
    try {
      await history.remove(target.id);
      toast.success('Conversación eliminada.');
      onDeleted?.(target.id);
    } catch {
      toast.error('No se pudo eliminar la conversación. Inténtalo de nuevo.');
    }
  };

  return (
    <>
      <nav aria-label="Conversaciones anteriores" className={className}>
        <ul ref={listRef} className="flex flex-col gap-0.5 p-2">
          {groups.map((group) => (
            <React.Fragment key={group.id}>
              <li role="presentation">
                <h3 className="px-2 pt-3 pb-1 text-meta font-medium text-muted-foreground">
                  {group.label}
                </h3>
              </li>
              {group.items.map((item) => {
                const title = item.title.trim() === '' ? 'Conversación sin título' : item.title;
                const active = item.id === activeId;
                const content = (
                  <>
                    <span
                      className={cn('truncate text-sm', active ? 'font-semibold' : 'font-medium')}
                    >
                      {title}
                    </span>
                    <span className="text-meta text-muted-foreground tabular-nums">
                      {whenLabel(item.updatedAt, group.id)}
                    </span>
                  </>
                );
                const rowClass = cn(
                  'flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-2.5 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                  active && 'bg-primary-subtle',
                );
                return (
                  <li key={item.id} className="flex items-center gap-1">
                    {hrefFor ? (
                      <Link
                        href={hrefFor(item.id)}
                        title={title}
                        aria-current={active ? 'page' : undefined}
                        className={rowClass}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        title={title}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onOpen?.(item.id)}
                        className={rowClass}
                      >
                        {content}
                      </button>
                    )}
                    <Button
                      type="button"
                      variant="ghost-destructive"
                      size="icon-sm"
                      aria-label={`Eliminar conversación «${title}»`}
                      onClick={() => setPending(item)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>
      </nav>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`¿Eliminar la conversación «${pending?.title ?? ''}»?`}
        description="Se borrará todo el historial de este chat. Esta acción no se puede deshacer."
        confirmLabel="Eliminar conversación"
        tone="danger"
        onConfirm={confirmDelete}
        returnFocusTo={() =>
          listRef.current?.querySelector<HTMLElement>('a, button') ?? fallbackFocus?.() ?? null
        }
      />
    </>
  );
}
