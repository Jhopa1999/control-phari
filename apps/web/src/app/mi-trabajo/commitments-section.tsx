'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { DueBadge } from '@/components/due-badge';
import { InlineNotice } from '@/components/inline-notice';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import type { CommitmentMyWork, CommitmentMyWorkItem } from '@/lib/api-client';
import {
  CommitmentError,
  loadMyWorkCommitments,
  transitionCommitment,
} from '@/lib/commitments';
import { formatDateOnly } from '@/lib/format';
import { cn } from '@/lib/utils';

type LoadState = 'loading' | 'success' | 'error';

const HEADING_ID = 'mt-compromisos-titulo';
const MODULE_HREF = '/seguimiento/reuniones?tab=compromisos';
/** Filas visibles antes de «Ver las N restantes». */
const VISIBLE_LIMIT = 5;

export interface CommitmentsSectionProps {
  /** Informa el total cargado (null mientras carga o si falló) para matizar el vacío de la página. */
  onTotalChange?: (total: number | null) => void;
  /** Mensaje para la región viva de la página. */
  announce: (message: string) => void;
}

/**
 * «Compromisos» en Mi trabajo: los abiertos de la persona (asignados a ella o,
 * sin asignado, de los que es responsable) que vencen hoy o están vencidos
 * (GET /commitments/my-work). Carga y error propios: un fallo aquí no bloquea
 * las tareas. Completar usa la transición existente del compromiso; la API
 * decide cuáles se pueden completar (`canComplete`). Sin compromisos que
 * mostrar, la sección no se renderiza.
 */
export function CommitmentsSection({
  onTotalChange,
  announce,
}: CommitmentsSectionProps): React.ReactElement | null {
  const { actorId } = useActor();
  const [data, setData] = React.useState<CommitmentMyWork | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [expanded, setExpanded] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // El notificador del padre puede cambiar de identidad en cada render: se guarda en un ref.
  const onTotalRef = React.useRef(onTotalChange);
  React.useEffect(() => {
    onTotalRef.current = onTotalChange;
  });

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const res = await loadMyWorkCommitments();
      if (!Array.isArray(res.items)) throw new Error('Respuesta inválida.');
      setData(res);
      setState('success');
      onTotalRef.current?.(res.total);
    } catch {
      setState((prev) => (prev === 'success' ? prev : 'error'));
      onTotalRef.current?.(null);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    loadMyWorkCommitments()
      .then((res) => {
        if (!active) return;
        // Una respuesta inesperada se trata como error de la sección, nunca rompe la página.
        if (!Array.isArray(res.items)) throw new Error('Respuesta inválida.');
        setData(res);
        setState('success');
        onTotalRef.current?.(res.total);
      })
      .catch(() => {
        if (!active) return;
        setState((prev) => (prev === 'success' ? prev : 'error'));
        onTotalRef.current?.(null);
      });
    return () => {
      active = false;
    };
  }, [actorId, attempt]);

  async function handleComplete(item: CommitmentMyWorkItem, index: number): Promise<void> {
    setBusyId(item.id);
    setFailure(null);
    try {
      await transitionCommitment(item.id, { toState: 'COMPLETADO' });
      toast.success('Compromiso completado.');
      announce(`Compromiso «${item.title}» completado.`);
      await load();
      // El foco pasa al siguiente compromiso o, si no queda otro, al encabezado.
      requestAnimationFrame(() => {
        const siblings = document.querySelectorAll<HTMLButtonElement>('[data-commitment-complete]');
        (siblings[index] ?? siblings[index - 1] ?? headingRef.current)?.focus();
      });
    } catch (err) {
      setFailure(
        err instanceof CommitmentError
          ? err.message
          : 'No se pudo completar el compromiso. Inténtalo de nuevo.',
      );
    } finally {
      setBusyId(null);
    }
  }

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-card">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <InlineNotice
        tone="warning"
        role="status"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          >
            Reintentar
          </Button>
        }
      >
        No se pudieron cargar tus compromisos.
      </InlineNotice>
    );
  }
  if (!data || data.items.length === 0) return null;

  const visible = expanded ? data.items : data.items.slice(0, VISIBLE_LIMIT);
  const hidden = data.items.length - visible.length;
  const hasOverdue = data.overdueCount > 0;

  return (
    <section
      aria-labelledby={HEADING_ID}
      className={cn(
        'flex flex-col gap-3 rounded-xl border-t-2 bg-card p-4 shadow-card',
        hasOverdue ? 'border-t-danger' : 'border-t-warning',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Handshake aria-hidden="true" className="size-4 text-link" />
          <h2
            id={HEADING_ID}
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Compromisos
          </h2>
          <Badge variant="neutral" className="tabular-nums">
            {data.items.length}
          </Badge>
        </div>
        <Link
          href={MODULE_HREF}
          className="inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
        >
          Ver todos
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      {data.upcomingCount > 0 ? (
        <p className="-mt-1 text-meta text-muted-foreground">
          {`y ${data.upcomingCount} más con vencimiento posterior`}
        </p>
      ) : null}
      {failure ? (
        <InlineNotice tone="warning" role="alert">
          {failure}
        </InlineNotice>
      ) : null}
      <ul aria-label="Compromisos pendientes" className="flex flex-col gap-2">
        {visible.map((item, index) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 rounded-lg bg-surface-subtle px-3 py-2 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium" title={item.title}>
                {item.title}
              </span>
              <span className="text-meta text-muted-foreground">
                {[
                  item.sourceMeetingTitle ? `De la reunión «${item.sourceMeetingTitle}»` : null,
                  item.processName,
                  `Vence ${formatDateOnly(item.dueDate)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DueBadge status={item.dueStatus} daysToDue={item.daysToDue} dueDate={item.dueDate} />
              {item.state === 'BLOQUEADO' ? <StatusBadge kind="record" value={item.state} /> : null}
            </div>
            <div className="flex flex-wrap gap-2 max-sm:[&>button]:flex-1">
              {item.canComplete ? (
                <Button
                  type="button"
                  size="sm"
                  data-commitment-complete=""
                  className="pointer-coarse:min-h-11 max-sm:min-h-11"
                  loading={busyId === item.id}
                  disabled={busyId !== null && busyId !== item.id}
                  aria-label={`Completar compromiso: ${item.title}`}
                  onClick={() => void handleComplete(item, index)}
                >
                  <Check aria-hidden="true" />
                  Completar
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            Ver las {hidden} restantes
          </Button>
        </div>
      ) : null}
    </section>
  );
}
