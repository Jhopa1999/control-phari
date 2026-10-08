'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuditEvent, Process } from '@/lib/api-client';
import { listAuditEvents } from '@/lib/audit';
import { listProcesses } from '@/lib/team';
import { VerCambioDialog } from './ver-cambio-dialog';

type LoadState = 'loading' | 'success' | 'error';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function AuditoriaView(): React.ReactElement {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [selected, setSelected] = React.useState<AuditEvent | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      // Los procesos complementan la vista (nombre legible); si no se pueden
      // leer no se bloquea la auditoria.
      const [ev, procs] = await Promise.all([
        listAuditEvents(),
        listProcesses().catch(() => [] as Process[]),
      ]);
      setEvents(ev);
      setProcesses(procs);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const processById = React.useMemo(() => {
    const map = new Map<string, Process>();
    for (const p of processes) map.set(p.id, p);
    return map;
  }, [processes]);

  function processLabel(id: string | null): string {
    if (!id) return '—';
    const p = processById.get(id);
    return p ? `${p.name} (${p.code})` : id;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Eventos de mutacion visibles segun tu alcance.
        </p>
      </header>

      <section aria-live="polite" className="rounded-lg border bg-card">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible cargar la auditoria.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">No hay eventos visibles.</p>
            <p className="text-sm text-muted-foreground">
              Las mutaciones dentro de tu alcance apareceran aqui.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Proceso</TableHead>
                <TableHead>Accion</TableHead>
                <TableHead>Objeto</TableHead>
                <TableHead className="text-right">Cambio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </TableCell>
                  <TableCell>{event.actorUserId ?? 'Sistema'}</TableCell>
                  <TableCell>{processLabel(event.scopeProcessId)}</TableCell>
                  <TableCell className="font-medium">{event.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {event.objectType}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelected(event)}
                      >
                        Ver cambio
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <VerCambioDialog
        event={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
