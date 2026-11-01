'use client';

import * as React from 'react';
import Link from 'next/link';
import { Ban, CircleCheck, Clock, ChevronRight, ListChecks, TriangleAlert } from 'lucide-react';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import type { Proposal } from '@/lib/assistant';
import { argEntries, proposalHref } from '@/lib/assistant-format';
import { cn } from '@/lib/utils';
import { useAssistant } from './assistant-provider';


function StatusLine({ proposal }: { proposal: Proposal }): React.ReactElement | null {
  switch (proposal.status) {
    case 'CONFIRMADA': {
      const href = proposalHref(proposal);
      return (
        <InlineNotice tone="success" role="status" title="Listo, la acción se realizó">
          {proposal.resultTitle ? <p>{proposal.resultTitle}</p> : null}
          {href ? (
            <Link
              href={href}
              className="text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Ver solicitud
            </Link>
          ) : null}
        </InlineNotice>
      );
    }
    case 'FALLIDA':
      return (
        <InlineNotice tone="danger" role="alert" title="No se pudo realizar la acción">
          <p>{proposal.error ?? 'Inténtalo de nuevo más tarde.'}</p>
          <p className="text-muted-foreground">
            No se aplicó ningún cambio. Pídele al asistente que la prepare de nuevo.
          </p>
        </InlineNotice>
      );
    case 'DESCARTADA':
      return (
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Ban className="size-3.5" aria-hidden="true" />
          Descartaste esta propuesta.
        </p>
      );
    case 'EXPIRADA':
      return (
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          Esta propuesta venció. Pídele al asistente que la prepare de nuevo.
        </p>
      );
    default:
      return null;
  }
}

const STATUS_LABEL: Record<Proposal['status'], string> = {
  PENDIENTE: 'Pendiente de tu confirmación',
  EJECUTANDO: 'Ejecutando…',
  CONFIRMADA: 'Confirmada',
  FALLIDA: 'No se realizó',
  DESCARTADA: 'Descartada',
  EXPIRADA: 'Vencida',
};

/**
 * Propuesta de acción del asistente. NUNCA se confirma sola: la persona decide
 * con «Confirmar» o «Descartar». Al confirmar, el backend ejecuta la acción con
 * los permisos de esa persona; si la API la rechaza, se explica aquí.
 */
export function ProposalCard({ proposal }: { proposal: Proposal }): React.ReactElement {
  const { confirmProposal, discardProposal, streaming } = useAssistant();
  const [open, setOpen] = React.useState(false);
  const detailsId = React.useId();
  const entries = argEntries(proposal.args);
  const pending = proposal.status === 'PENDIENTE';
  const running = proposal.status === 'EJECUTANDO';

  return (
    <section
      aria-label={`Propuesta: ${proposal.title}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-background p-3',
        pending ? 'border-border-strong' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          {proposal.title}
        </p>
        <p
          className={cn(
            'flex items-center gap-1 text-meta font-medium',
            pending ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {pending ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : null}
          {proposal.status === 'CONFIRMADA' ? (
            <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
          ) : null}
          {STATUS_LABEL[proposal.status]}
        </p>
      </div>

      <p className="text-sm wrap-break-word">{proposal.summary}</p>

      {entries.length > 0 ? (
        <div className="flex flex-col">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-md text-meta font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-10"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                open && 'rotate-90',
              )}
              aria-hidden="true"
            />
            Ver los datos exactos
          </button>
          <dl
            id={detailsId}
            hidden={!open}
            className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-muted/40 p-2 text-meta"
          >
            {entries.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt className="font-medium text-muted-foreground">{key}</dt>
                <dd className="wrap-break-word">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      ) : null}

      {pending || running ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            loading={running}
            disabled={streaming}
            onClick={() => confirmProposal(proposal.id)}
          >
            {running ? 'Ejecutando…' : 'Confirmar'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={running || streaming}
            onClick={() => discardProposal(proposal.id)}
          >
            Descartar
          </Button>
          {streaming ? (
            <p className="text-meta text-muted-foreground">Espera a que el asistente termine.</p>
          ) : null}
        </div>
      ) : (
        <StatusLine proposal={proposal} />
      )}
    </section>
  );
}
