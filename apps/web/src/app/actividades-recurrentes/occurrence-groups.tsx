'use client';

import * as React from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  type LucideIcon,
} from 'lucide-react';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
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
import type { CatalogItem, RecurringBoard, RecurringOccurrence } from '@/lib/api-client';
import { formatDateOnly, formatHours } from '@/lib/format';
import { addDays, isoWeekNumber, relativeDayText, weekRangeLabel } from '@/lib/recurring-format';
import { activityTypeLabel } from '@/lib/status-labels';
import { cn } from '@/lib/utils';
import { OccurrenceActionButtons } from './occurrence-shared';

interface Handlers {
  onStart: (occurrence: RecurringOccurrence) => void;
  onComplete: (occurrence: RecurringOccurrence) => void;
  onDetail: (occurrence: RecurringOccurrence) => void;
}

interface RowsProps extends Handlers {
  rows: RecurringOccurrence[];
  today: string;
  activityTypes: CatalogItem[];
  label: string;
}

/** Texto bajo la fecha: relativo y, si está programada, cuándo se habilita. */
function WhenCell({ occurrence, today }: { occurrence: RecurringOccurrence; today: string }): React.ReactElement {
  return (
    <>
      <span className="tabular-nums">{formatDateOnly(occurrence.targetDate)}</span>
      <span className="block text-meta text-muted-foreground">
        {relativeDayText(occurrence.targetDate, today)}
      </span>
      {occurrence.displayStatus === 'PROGRAMADA' ? (
        <span className="block text-meta text-muted-foreground">
          Se habilita el {formatDateOnly(occurrence.opensOn)}
        </span>
      ) : null}
    </>
  );
}

function TitleBlock({
  occurrence,
  activityTypes,
  onDetail,
}: {
  occurrence: RecurringOccurrence;
  activityTypes: CatalogItem[];
  onDetail: (occurrence: RecurringOccurrence) => void;
}): React.ReactElement {
  const muted = occurrence.displayStatus === 'CANCELADA';
  return (
    <>
      <button
        type="button"
        onClick={() => onDetail(occurrence)}
        className={cn(
          'rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          muted && 'text-muted-foreground',
        )}
      >
        {occurrence.activityTitle}
      </button>
      <span className="block text-meta text-muted-foreground">
        {activityTypeLabel(occurrence.activityType, activityTypes)}
      </span>
      {occurrence.responsibleKind === 'AREA' && occurrence.startedByName ? (
        <span className="block text-meta text-muted-foreground">
          Tomada por {occurrence.startedByName}
        </span>
      ) : null}
    </>
  );
}

/** Tabla en escritorio y lista de tarjetas en móvil (< md). */
function OccurrenceRows({
  rows,
  today,
  activityTypes,
  label,
  onStart,
  onComplete,
  onDetail,
}: RowsProps): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card">
      <div className="hidden md:block">
        <Table scrollLabel={label}>
          <TableHeader>
            <TableRow>
              <TableHead>Actividad</TableHead>
              <TableHead>Cuándo</TableHead>
              <TableHead>Esfuerzo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((occurrence) => (
              <TableRow key={occurrence.id} className="hover:bg-muted/40">
                <TableCell className="min-w-56">
                  <TitleBlock occurrence={occurrence} activityTypes={activityTypes} onDetail={onDetail} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <WhenCell occurrence={occurrence} today={today} />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatHours(occurrence.estimatedHours)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="occurrence" value={occurrence.displayStatus} />
                </TableCell>
                <TableCell>
                  <OccurrenceActionButtons
                    occurrence={occurrence}
                    onStart={onStart}
                    onComplete={onComplete}
                    onDetail={onDetail}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label={label} data-card-list className="flex flex-col divide-y md:hidden">
        {rows.map((occurrence) => (
          <li key={occurrence.id} className="flex flex-col gap-2 p-4">
            <div>
              <TitleBlock occurrence={occurrence} activityTypes={activityTypes} onDetail={onDetail} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="occurrence" value={occurrence.displayStatus} />
              <span className="text-meta tabular-nums text-muted-foreground">
                {formatHours(occurrence.estimatedHours)}
              </span>
            </div>
            <div className="text-sm">
              <WhenCell occurrence={occurrence} today={today} />
            </div>
            <OccurrenceActionButtons
              block
              occurrence={occurrence}
              onStart={onStart}
              onComplete={onComplete}
              onDetail={onDetail}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupTitle({
  icon: Icon,
  iconClass,
  children,
}: {
  icon: LucideIcon;
  iconClass: string;
  children: string;
}): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden="true" className={cn('size-4', iconClass)} />
      {children}
    </span>
  );
}

/** Contenedor de un grupo: destino de los accesos rápidos de la cabecera. */
function GroupFrame({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div id={`grupo-${id}`} tabIndex={-1} className={cn('scroll-mt-4 outline-none', className)}>
      {children}
    </div>
  );
}

/** «Semana 47 · 17 al 23 nov»: lunes a domingo de una fecha objetivo. */
function weekOf(date: string): { key: string; label: string } {
  const day = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  const monday = addDays(date.slice(0, 10), -((day + 6) % 7));
  const sunday = addDays(monday, 6);
  return {
    key: monday,
    label: weekRangeLabel({ number: isoWeekNumber(monday), startDate: monday, endDate: sunday }),
  };
}

const COMPLETED_OPEN_KEY = 'recurrentes.completadas.abierto';
const UPCOMING_LIMIT = 8;
const OVERDUE_LIMIT = 10;

export interface OccurrenceGroupsProps extends Handlers {
  board: RecurringBoard;
  activityTypes: CatalogItem[];
  completedWeeks: number;
  onCompletedWeeksChange: (weeks: number) => void;
}

/**
 * Los cuatro grupos de «Qué me toca» (Vencidas, Esta semana, Próximas,
 * Completadas recientes). El agrupamiento lo hace la API (GET board); aquí solo
 * se presentan. Un grupo vacío no se renderiza.
 */
export function OccurrenceGroups({
  board,
  activityTypes,
  completedWeeks,
  onCompletedWeeksChange,
  onStart,
  onComplete,
  onDetail,
}: OccurrenceGroupsProps): React.ReactElement {
  const [showAllOverdue, setShowAllOverdue] = React.useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = React.useState(false);
  const [completedOpen, setCompletedOpen] = React.useState<boolean>(() => {
    try {
      return window.localStorage.getItem(COMPLETED_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  function toggleCompleted(): void {
    const next = !completedOpen;
    setCompletedOpen(next);
    try {
      window.localStorage.setItem(COMPLETED_OPEN_KEY, next ? '1' : '0');
    } catch {
      // Sin almacenamiento disponible: la preferencia solo vale en esta sesión.
    }
  }

  const common = { today: board.today, activityTypes, onStart, onComplete, onDetail };

  const overdue = showAllOverdue ? board.overdue : board.overdue.slice(0, OVERDUE_LIMIT);
  const upcoming = showAllUpcoming ? board.upcoming : board.upcoming.slice(0, UPCOMING_LIMIT);
  const upcomingByWeek = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; items: RecurringOccurrence[] }> = [];
    for (const row of upcoming) {
      const week = weekOf(row.targetDate);
      const last = groups[groups.length - 1];
      if (last && last.key === week.key) last.items.push(row);
      else groups.push({ ...week, items: [row] });
    }
    return groups;
  }, [upcoming]);

  return (
    <div className="flex flex-col gap-6">
      {board.overdue.length > 0 ? (
        <GroupFrame id="overdue">
          <Section
            headingLevel={3}
            title="Vencidas"
            count={board.overdue.length}
            actions={
              board.overdue.length > OVERDUE_LIMIT && !showAllOverdue ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAllOverdue(true)}>
                  Ver todas ({board.overdue.length})
                </Button>
              ) : null
            }
          >
            <div className="border-l-2 border-l-danger">
              <OccurrenceRows {...common} rows={overdue} label="Actividades vencidas" />
            </div>
          </Section>
        </GroupFrame>
      ) : null}

      {board.thisWeek.length > 0 ? (
        <GroupFrame id="thisWeek">
          <Section headingLevel={3} title="Esta semana" count={board.thisWeek.length}>
            <OccurrenceRows {...common} rows={board.thisWeek} label="Actividades de esta semana" />
          </Section>
        </GroupFrame>
      ) : null}

      {board.upcoming.length > 0 ? (
        <GroupFrame id="upcoming">
          <Section headingLevel={3} title="Próximas" count={board.upcoming.length}>
            <div className="flex flex-col gap-4">
              {upcomingByWeek.map((week) => (
                <div key={week.key} className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <CalendarClock aria-hidden="true" className="size-4" />
                    {week.label}
                  </p>
                  <OccurrenceRows {...common} rows={week.items} label={week.label} />
                </div>
              ))}
              {board.upcoming.length > UPCOMING_LIMIT && !showAllUpcoming ? (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={() => setShowAllUpcoming(true)}
                >
                  Ver más ({board.upcoming.length - UPCOMING_LIMIT})
                </Button>
              ) : null}
            </div>
          </Section>
        </GroupFrame>
      ) : null}

      <GroupFrame id="completed">
        <section aria-labelledby="grupo-completadas-titulo" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="grupo-completadas-titulo" className="text-base font-semibold">
              <button
                type="button"
                aria-expanded={completedOpen}
                aria-controls="grupo-completadas-contenido"
                onClick={toggleCompleted}
                className="inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {completedOpen ? (
                  <ChevronDown aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4" />
                )}
                <GroupTitle icon={CircleCheck} iconClass="text-success">
                  Completadas recientes
                </GroupTitle>
                <span className="text-meta font-normal tabular-nums text-muted-foreground">
                  ({board.completed.length})
                </span>
              </button>
            </h3>
            {completedOpen ? (
              <div className="flex items-center gap-2">
                <span id="completadas-filtro" className="text-meta text-muted-foreground">
                  Mostrar:
                </span>
                <Select
                  value={String(completedWeeks)}
                  onValueChange={(value) => onCompletedWeeksChange(Number(value))}
                >
                  <SelectTrigger aria-labelledby="completadas-filtro" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">Últimas 4 semanas</SelectItem>
                    <SelectItem value="12">Últimas 12 semanas</SelectItem>
                    <SelectItem value="0">Todas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div id="grupo-completadas-contenido" hidden={!completedOpen}>
            {board.completed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no hay actividades completadas en este periodo.
              </p>
            ) : (
              <OccurrenceRows {...common} rows={board.completed} label="Actividades completadas recientemente" />
            )}
          </div>
        </section>
      </GroupFrame>
    </div>
  );
}
