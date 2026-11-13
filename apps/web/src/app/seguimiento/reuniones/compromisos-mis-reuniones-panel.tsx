'use client';

import * as React from 'react';
import { Handshake } from 'lucide-react';
import { DueBadge } from '@/components/due-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { StatusBadge } from '@/components/status-badge';
import { StatStrip, StatTile } from '@/components/stat-tile';
import { TableSkeleton } from '@/components/table-skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActor } from '@/lib/actor-context';
import type {
  CommitmentFollowUpItem,
  DueStatus,
  MeetingCommitmentsOpen,
} from '@/lib/api-client';
import { formatDateOnly } from '@/lib/format';
import { MeetingError, listOpenCommitmentsOfMyMeetings } from '@/lib/meetings';
import { initialsOf } from '@/lib/user-initials';
import { cn } from '@/lib/utils';
import type { CoordinationData } from './reuniones-view';

const ALL = 'ALL';

type LoadState = 'loading' | 'success' | 'error';

/** Filtro de los contadores: se aplica a la lista ya filtrada por la API. */
type DueFilter = 'TODOS' | DueStatus;

function Avatar({ name }: { name: string | null }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-link"
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Pestaña «Mis compromisos abiertos»: compromisos abiertos de las reuniones
 * donde el actor es responsable, con la persona asignada y el semáforo de
 * vencimiento que calcula la API. Es de seguimiento: aquí no se completan.
 */
export function CompromisosMisReunionesPanel({
  data,
  onOpenMeeting,
  onOpenCommitment,
}: {
  data: CoordinationData;
  onOpenMeeting: (meetingId: string) => void;
  onOpenCommitment: (commitmentId: string) => void;
}): React.ReactElement {
  const { processes, people, meetings } = data;
  const { permissions } = useActor();
  const myId = permissions?.userId ?? null;
  const [assignedFilter, setAssignedFilter] = React.useState(ALL);
  const [meetingFilter, setMeetingFilter] = React.useState(ALL);
  const [processFilter, setProcessFilter] = React.useState(ALL);
  const [dueFilter, setDueFilter] = React.useState<DueFilter>('TODOS');
  const [result, setResult] = React.useState<MeetingCommitmentsOpen | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  const filtersActive = assignedFilter !== ALL || meetingFilter !== ALL || processFilter !== ALL;

  React.useEffect(() => {
    let active = true;
    listOpenCommitmentsOfMyMeetings({
      ...(assignedFilter !== ALL ? { assignedUserId: assignedFilter } : {}),
      ...(meetingFilter !== ALL ? { meetingId: meetingFilter } : {}),
      ...(processFilter !== ALL ? { processId: processFilter } : {}),
    })
      .then((res) => {
        if (!active) return;
        setResult(res);
        setError(null);
        setState('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof MeetingError ? err.message : null);
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [assignedFilter, meetingFilter, processFilter, attempt]);

  function clearFilters(): void {
    setState('loading');
    setAssignedFilter(ALL);
    setMeetingFilter(ALL);
    setProcessFilter(ALL);
    setDueFilter('TODOS');
  }

  const items = React.useMemo<CommitmentFollowUpItem[]>(() => {
    const all = result?.items ?? [];
    return dueFilter === 'TODOS' ? all : all.filter((i) => i.dueStatus === dueFilter);
  }, [result, dueFilter]);

  const myMeetings = React.useMemo(
    () => meetings.filter((m) => m.responsibleUserId === myId),
    [meetings, myId],
  );

  if (state === 'error') {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <ErrorState
          title="No fue posible cargar los compromisos de tus reuniones."
          message={error}
          onRetry={() => {
            setState('loading');
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );
  }

  const counts = result?.counts;
  const tiles: { key: DueFilter; label: string; value: number; tone?: 'danger' | 'warning' }[] = [
    { key: 'TODOS', label: 'Abiertos', value: counts?.total ?? 0 },
    { key: 'VENCIDO', label: 'Vencidos', value: counts?.vencido ?? 0, tone: 'danger' },
    { key: 'VENCE_HOY', label: 'Vencen hoy', value: counts?.venceHoy ?? 0, tone: 'warning' },
    { key: 'PROXIMO', label: 'Próximos 7 días', value: counts?.proximo ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <StatStrip label="Resumen de compromisos abiertos de mis reuniones">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            aria-pressed={dueFilter === tile.key}
            aria-label={`${tile.label}: ${tile.value}${dueFilter === tile.key ? ' (filtro activo)' : ''}`}
            className={cn(
              'min-w-0 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              dueFilter === tile.key && 'bg-primary-subtle',
            )}
            onClick={() => setDueFilter(dueFilter === tile.key ? 'TODOS' : tile.key)}
          >
            <StatTile label={tile.label} value={state === 'loading' ? '…' : tile.value} tone={tile.tone} />
          </button>
        ))}
      </StatStrip>

      <div role="group" aria-label="Filtros de compromisos abiertos" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="mis-com-asignado">Asignado a</Label>
          <Select
            value={assignedFilter}
            onValueChange={(v) => {
              setState('loading');
              setAssignedFilter(v);
            }}
          >
            <SelectTrigger id="mis-com-asignado" className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las personas</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mis-com-reunion">Reunión</Label>
          <Select
            value={meetingFilter}
            onValueChange={(v) => {
              setState('loading');
              setMeetingFilter(v);
            }}
          >
            <SelectTrigger id="mis-com-reunion" className="w-full sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas mis reuniones</SelectItem>
              {myMeetings.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {`${m.title} (${formatDateOnly(m.meetingDate)})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mis-com-proceso">Proceso</Label>
          <Select
            value={processFilter}
            onValueChange={(v) => {
              setState('loading');
              setProcessFilter(v);
            }}
          >
            <SelectTrigger id="mis-com-proceso" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los procesos</SelectItem>
              {processes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filtersActive || dueFilter !== 'TODOS' ? (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {result?.truncated ? (
        <InlineNotice tone="info" role="status">
          Se muestran los primeros 500; afina los filtros para ver el resto.
        </InlineNotice>
      ) : null}

      <p role="status" className="sr-only">
        {state === 'loading'
          ? 'Cargando compromisos abiertos'
          : `${items.length} ${items.length === 1 ? 'compromiso abierto' : 'compromisos abiertos'}`}
      </p>

      {state === 'loading' ? (
        <div aria-busy="true" className="overflow-hidden rounded-xl border bg-card shadow-card">
          <TableSkeleton rows={4} columns={5} />
        </div>
      ) : items.length === 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          {filtersActive || dueFilter !== 'TODOS' ? (
            <EmptyState
              icon={Handshake}
              title="Ningún compromiso coincide con los filtros"
              description="Cambia o limpia los filtros para ver más compromisos."
              action={
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Handshake}
              title="No tienes compromisos abiertos de tus reuniones"
              description="Cuando cierres actas con compromisos, aparecerán aquí hasta que se completen."
            />
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-card md:block">
            <Table aria-label="Compromisos abiertos de mis reuniones">
              <TableHeader>
                <TableRow>
                  <TableHead>Compromiso</TableHead>
                  <TableHead>Asignado a</TableHead>
                  <TableHead>Reunión</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={cn(item.dueStatus === 'VENCIDO' && 'border-l-2 border-l-danger')}
                  >
                    <TableCell className="max-w-xs">
                      <span className="block font-medium wrap-break-word">{item.title}</span>
                      {item.expectedResult ? (
                        <span className="block text-meta text-muted-foreground wrap-break-word">
                          {item.expectedResult}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Avatar name={item.assignedUserName} />
                        <span>{item.assignedUserName ?? 'Sin asignar'}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left text-link underline-offset-4 hover:underline"
                        onClick={() => onOpenMeeting(item.meetingId)}
                      >
                        {item.meetingTitle}
                      </button>
                      <span className="block text-meta text-muted-foreground">
                        {formatDateOnly(item.meetingDate)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <DueBadge status={item.dueStatus} daysToDue={item.daysToDue} dueDate={item.dueDate} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="record" value={item.state} />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Abrir acta de ${item.title}`}
                          onClick={() => onOpenMeeting(item.meetingId)}
                        >
                          Abrir acta
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Ver compromiso: ${item.title}`}
                          onClick={() => onOpenCommitment(item.id)}
                        >
                          Ver compromiso
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul aria-label="Compromisos abiertos de mis reuniones" className="flex flex-col gap-2 md:hidden">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'flex flex-col gap-2 rounded-xl bg-card p-3 shadow-card',
                  item.dueStatus === 'VENCIDO' && 'border-l-2 border-l-danger',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <DueBadge status={item.dueStatus} daysToDue={item.daysToDue} dueDate={item.dueDate} />
                  <StatusBadge kind="record" value={item.state} />
                </div>
                <span className="font-medium wrap-break-word">{item.title}</span>
                <span className="flex items-center gap-2 text-sm">
                  <Avatar name={item.assignedUserName} />
                  {item.assignedUserName ?? 'Sin asignar'}
                </span>
                <span className="text-meta text-muted-foreground">
                  {`${item.meetingTitle} · ${formatDateOnly(item.meetingDate)}`}
                </span>
                <div className="flex gap-2 max-sm:[&>button]:flex-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="max-sm:min-h-11"
                    aria-label={`Abrir acta de ${item.title}`}
                    onClick={() => onOpenMeeting(item.meetingId)}
                  >
                    Abrir acta
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="max-sm:min-h-11"
                    aria-label={`Ver compromiso: ${item.title}`}
                    onClick={() => onOpenCommitment(item.id)}
                  >
                    Ver compromiso
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
