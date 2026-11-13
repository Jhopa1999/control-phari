'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Area, RecurringCalendarQuery, RecurringOccurrence, User } from '@/lib/api-client';
import { formatDateOnlyWithWeekday } from '@/lib/format';
import { listCalendar } from '@/lib/recurring-activities';
import { isoWeekNumber, monthGrid, monthTitle, shortDayLabel } from '@/lib/recurring-format';
import { getStatus } from '@/lib/status-presentation';
import { cn } from '@/lib/utils';
import { CHIP_CLASSES, DISPLAY_STATUS_ORDER, messageOf } from './occurrence-shared';

const WEEKDAYS = [
  { short: 'Lun', full: 'Lunes' },
  { short: 'Mar', full: 'Martes' },
  { short: 'Mié', full: 'Miércoles' },
  { short: 'Jue', full: 'Jueves' },
  { short: 'Vie', full: 'Viernes' },
  { short: 'Sáb', full: 'Sábado' },
  { short: 'Dom', full: 'Domingo' },
];
const MAX_CHIPS = 3;

export interface CalendarTabProps {
  canManage: boolean;
  users: User[];
  areas: Area[];
  /** Hoy según la API (tablero); si aún no llegó, se usa el día local. */
  today: string;
  onOpenDetail: (occurrence: RecurringOccurrence) => void;
  /** Cambia cuando una acción modificó datos: fuerza recargar el rango. */
  reloadKey: number;
}

type Scope = string; // 'mine' | 'all' | 'user:<id>' | 'area:<id>'

function queryFor(scope: Scope, from: string, to: string): RecurringCalendarQuery {
  if (scope === 'mine') return { from, to, scope: 'mine' };
  if (scope === 'all') return { from, to, scope: 'all' };
  if (scope.startsWith('user:')) return { from, to, scope: 'all', responsibleUserId: scope.slice(5) };
  return { from, to, scope: 'all', responsibleAreaId: scope.slice(5) };
}

function initials(name: string | null): string {
  if (!name) return '';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Ficha de una ocurrencia dentro de un día. */
function Chip({
  occurrence,
  showOwner,
  onOpen,
}: {
  occurrence: RecurringOccurrence;
  showOwner: boolean;
  onOpen: (occurrence: RecurringOccurrence) => void;
}): React.ReactElement {
  const presentation = getStatus('occurrence', occurrence.displayStatus);
  const Icon = presentation.icon;
  const owner = showOwner ? initials(occurrence.responsibleName) : '';
  return (
    <button
      type="button"
      title={`${occurrence.activityTitle} · ${presentation.label} · ${formatDateOnlyWithWeekday(occurrence.targetDate)}`}
      aria-label={`${occurrence.activityTitle}, ${presentation.label}, ${formatDateOnlyWithWeekday(occurrence.targetDate)}${
        showOwner && occurrence.responsibleName ? `, ${occurrence.responsibleName}` : ''
      }`}
      onClick={() => onOpen(occurrence)}
      className={cn(
        'flex w-full items-center gap-1 truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs text-foreground pointer-coarse:min-h-8 focus-visible:outline-2 focus-visible:outline-ring',
        CHIP_CLASSES[occurrence.displayStatus],
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3 shrink-0" /> : null}
      <span className="truncate">
        {owner ? <span aria-hidden="true">{owner} · </span> : null}
        {occurrence.activityTitle}
      </span>
    </button>
  );
}

/**
 * Pestaña «Calendario»: grilla mensual (lunes a domingo) con fichas por estado,
 * navegación por teclado (roving tabindex) y agenda en móvil. El rango y el
 * alcance los resuelve la API (GET calendar).
 */
export function CalendarTab({
  canManage,
  users,
  areas,
  today,
  onOpenDetail,
  reloadKey,
}: CalendarTabProps): React.ReactElement {
  const [cursor, setCursor] = React.useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const [scope, setScope] = React.useState<Scope>('mine');
  const [rows, setRows] = React.useState<RecurringOccurrence[]>([]);
  const [state, setState] = React.useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [focusDay, setFocusDay] = React.useState(today);
  const [dayDialog, setDayDialog] = React.useState<string | null>(null);
  const cellRefs = React.useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = React.useRef(false);

  const weeks = React.useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];

  React.useEffect(() => {
    let cancelled = false;
    listCalendar(queryFor(scope, from, to))
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setError(null);
        setState('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(messageOf(err));
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [scope, from, to, reloadKey, retry]);

  React.useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    cellRefs.current.get(focusDay)?.focus();
  }, [focusDay]);

  const byDay = React.useMemo(() => {
    const map = new Map<string, RecurringOccurrence[]>();
    for (const row of rows) {
      const key = row.targetDate.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [rows]);

  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const title = monthTitle(cursor.year, cursor.month);
  const showOwner = scope !== 'mine';
  const loading = state === 'loading';

  function shiftMonth(delta: number): void {
    setState('loading');
    setCursor((c) => {
      const date = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });
  }

  function goToday(): void {
    const [y, m] = today.split('-').map(Number);
    setState('loading');
    setCursor({ year: y, month: m - 1 });
    setFocusDay(today);
  }

  function changeScope(next: string): void {
    setState('loading');
    setScope(next);
  }

  function moveFocus(day: string, delta: number): void {
    const flat = weeks.flat();
    const index = flat.indexOf(day) + delta;
    if (index < 0 || index >= flat.length) return;
    pendingFocus.current = true;
    setFocusDay(flat[index]);
  }

  function handleCellKeyDown(event: React.KeyboardEvent<HTMLDivElement>, day: string): void {
    // Solo las teclas dirigidas a la celda; dentro de una ficha se respeta el botón.
    if (event.target !== event.currentTarget) return;
    const flat = weeks.flat();
    const col = flat.indexOf(day) % 7;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(day, -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(day, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(day, -7);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(day, 7);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus(day, -col);
        break;
      case 'End':
        event.preventDefault();
        moveFocus(day, 6 - col);
        break;
      case 'Enter':
        event.preventDefault();
        event.currentTarget.querySelector<HTMLElement>('button')?.focus();
        break;
      default:
    }
  }

  const rovingDay = weeks.flat().includes(focusDay) ? focusDay : weeks.flat().find((d) => d === today) ?? weeks[0][0];
  const monthRows = rows.filter((row) => row.targetDate.startsWith(monthPrefix));
  const agendaDays = Array.from(byDay.keys())
    .filter((key) => key.startsWith(monthPrefix))
    .sort();
  const dayRows = dayDialog ? (byDay.get(dayDialog) ?? []) : [];

  const scopeSelect = canManage ? (
    <div className="flex items-center gap-2">
      <span id="calendar-scope-label" className="text-meta text-muted-foreground">
        Ver:
      </span>
      <Select value={scope} onValueChange={changeScope}>
        <SelectTrigger aria-labelledby="calendar-scope-label" className="w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mine">Mis actividades</SelectItem>
          <SelectItem value="all">Todo mi alcance</SelectItem>
          {areas.map((area) => (
            <SelectItem key={area.id} value={`area:${area.id}`}>
              Área: {area.name}
            </SelectItem>
          ))}
          {users.map((user) => (
            <SelectItem key={user.id} value={`user:${user.id}`}>
              {user.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Mes anterior" onClick={() => shiftMonth(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h2 aria-live="polite" className="min-w-40 text-center text-lg font-semibold">
            {title}
          </h2>
          <Button type="button" variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => shiftMonth(1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" onClick={goToday}>
            Hoy
          </Button>
        </div>
        {scopeSelect}
      </div>

      <ul aria-label="Leyenda de estados" className="flex flex-wrap gap-x-3 gap-y-1">
        {DISPLAY_STATUS_ORDER.map((status) => (
          <li key={status}>
            <StatusBadge kind="occurrence" value={status} />
          </li>
        ))}
      </ul>

      {state === 'error' ? (
        <div className="rounded-xl bg-card shadow-card">
          <ErrorState
            title="No fue posible cargar el calendario."
            message={error}
            onRetry={() => {
              setState('loading');
              setRetry((n) => n + 1);
            }}
          />
        </div>
      ) : state === 'loading' && rows.length === 0 ? (
        <Skeleton className="h-[28rem] rounded-xl" />
      ) : (
        <>
          {state === 'success' && monthRows.length === 0 ? (
            <InlineNotice tone="info">No hay actividades en {title.toLowerCase()}.</InlineNotice>
          ) : null}

          <div
            role="grid"
            aria-label={`Calendario de ${title.toLowerCase()}`}
            className="hidden overflow-hidden rounded-xl bg-card shadow-card md:block"
          >
            <div role="row" className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]">
              <div role="columnheader" className="p-1.5 text-meta text-muted-foreground">
                <span className="sr-only">Semana</span>
              </div>
              {WEEKDAYS.map((day) => (
                <div
                  key={day.full}
                  role="columnheader"
                  className="p-1.5 text-center text-meta font-medium text-muted-foreground"
                >
                  <abbr title={day.full} className="no-underline">
                    {day.short}
                  </abbr>
                </div>
              ))}
            </div>
            {weeks.map((week) => {
              const isCurrentWeek = week.includes(today);
              return (
                <div key={week[0]} role="row" className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]">
                  <div
                    role="rowheader"
                    className={cn(
                      'border-t border-border p-1.5 text-meta tabular-nums text-muted-foreground',
                      isCurrentWeek && 'border-l-2 border-l-primary',
                    )}
                  >
                    S{isoWeekNumber(week[0])}
                  </div>
                  {week.map((day) => {
                    const inMonth = day.startsWith(monthPrefix);
                    const items = inMonth ? (byDay.get(day) ?? []) : [];
                    const isToday = day === today;
                    const visible = items.slice(0, MAX_CHIPS);
                    const extra = items.length - visible.length;
                    const dayNumber = Number(day.slice(8, 10));
                    return (
                      <div
                        key={day}
                        role="gridcell"
                        ref={(el) => {
                          if (el) cellRefs.current.set(day, el);
                          else cellRefs.current.delete(day);
                        }}
                        tabIndex={day === rovingDay ? 0 : -1}
                        aria-label={`${formatDateOnlyWithWeekday(day)}${isToday ? ', hoy' : ''}, ${items.length} actividades`}
                        onFocus={() => setFocusDay(day)}
                        onKeyDown={(event) => handleCellKeyDown(event, day)}
                        className={cn(
                          'flex min-h-24 flex-col gap-1 border-t border-border bg-card p-1.5 focus-visible:outline-2 focus-visible:outline-ring',
                          isToday && 'ring-2 ring-inset ring-primary',
                        )}
                      >
                        <span
                          className={cn(
                            'text-meta tabular-nums',
                            isToday
                              ? 'flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground'
                              : 'text-muted-foreground',
                          )}
                          aria-hidden="true"
                        >
                          {dayNumber}
                        </span>
                        {visible.map((occurrence) => (
                          <Chip key={occurrence.id} occurrence={occurrence} showOwner={showOwner} onOpen={onOpenDetail} />
                        ))}
                        {extra > 0 ? (
                          <button
                            type="button"
                            onClick={() => setDayDialog(day)}
                            className="self-start rounded-sm text-meta text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            +{extra} más
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-4 md:hidden">
            {agendaDays.map((day) => (
              <section key={day} aria-label={formatDateOnlyWithWeekday(day)} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {shortDayLabel(day)}
                  {day === today ? ' · Hoy' : ''}
                </h3>
                {(byDay.get(day) ?? []).map((occurrence) => (
                  <Chip key={occurrence.id} occurrence={occurrence} showOwner={showOwner} onOpen={onOpenDetail} />
                ))}
              </section>
            ))}
          </div>
        </>
      )}

      <Dialog open={dayDialog !== null} onOpenChange={(open) => (!open ? setDayDialog(null) : undefined)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{dayDialog ? formatDateOnlyWithWeekday(dayDialog) : 'Día'}</DialogTitle>
            <DialogDescription>Actividades de este día.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            {dayRows.map((occurrence) => (
              <Chip
                key={occurrence.id}
                occurrence={occurrence}
                showOwner={showOwner}
                onOpen={(o) => {
                  setDayDialog(null);
                  onOpenDetail(o);
                }}
              />
            ))}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDayDialog(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
