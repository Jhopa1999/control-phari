import * as React from 'react';
import { Calendar, CalendarClock, CircleAlert, Clock, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { DueStatus } from '@/lib/api-client';
import { formatDateOnly, formatDateOnlyWithWeekday } from '@/lib/format';

const TONES: Record<DueStatus, { variant: NonNullable<BadgeProps['variant']>; Icon: LucideIcon }> = {
  VENCIDO: { variant: 'danger', Icon: CircleAlert },
  VENCE_HOY: { variant: 'warning', Icon: Clock },
  PROXIMO: { variant: 'info', Icon: CalendarClock },
  A_TIEMPO: { variant: 'neutral', Icon: Calendar },
};

/** Texto del semáforo; la API entrega `dueStatus` y `daysToDue`, aquí solo se redacta. */
export function dueText(status: DueStatus, daysToDue: number, dueDate: string): string {
  switch (status) {
    case 'VENCIDO':
      return `Vencido hace ${Math.abs(daysToDue)} d`;
    case 'VENCE_HOY':
      return 'Vence hoy';
    case 'PROXIMO':
      return daysToDue === 1 ? 'Vence mañana' : `Vence en ${daysToDue} d`;
    default:
      return `Vence el ${formatDateOnly(dueDate)}`;
  }
}

export interface DueBadgeProps {
  status: DueStatus | null | undefined;
  daysToDue: number | null | undefined;
  dueDate: string;
  className?: string;
}

/**
 * Semáforo de vencimiento de un compromiso: texto e icono, nunca solo color.
 * Sin estado (compromiso terminado) no se muestra nada.
 */
export function DueBadge({
  status,
  daysToDue,
  dueDate,
  className,
}: DueBadgeProps): React.ReactElement | null {
  if (!status) return null;
  const { variant, Icon } = TONES[status];
  return (
    <Badge variant={variant} className={className} title={formatDateOnlyWithWeekday(dueDate)}>
      <Icon aria-hidden="true" />
      {dueText(status, daysToDue ?? 0, dueDate)}
    </Badge>
  );
}
