import * as React from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InlineNoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_STYLES: Record<InlineNoticeTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'border-info-border bg-info-subtle', icon: 'text-info', Icon: Info },
  success: { box: 'border-success-border bg-success-subtle', icon: 'text-success', Icon: CircleCheck },
  warning: { box: 'border-warning-border bg-warning-subtle', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'border-danger-border bg-danger-subtle', icon: 'text-danger', Icon: CircleAlert },
  neutral: { box: 'border-neutral-border bg-neutral-subtle', icon: 'text-neutral', Icon: Info },
};

export interface InlineNoticeProps {
  /** Por defecto info. */
  tone?: InlineNoticeTone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  /** Por defecto 'note'; 'alert' solo si aparece por un evento. */
  role?: 'note' | 'status' | 'alert';
  /** Por defecto Info / CircleCheck / TriangleAlert / CircleAlert / Info; false sin icono. */
  icon?: LucideIcon | false;
  /** P. ej. el `${formId}-error` de FormError, destino de aria-describedby. */
  id?: string;
  className?: string;
}

/**
 * Aviso en línea (design §7.2). Sustituye los avisos ad hoc (bg-muted, el ámbar
 * de sesión expirada, el rojo de «Solicitud bloqueada»…). Seguro para servidor
 * (sin hooks ni Radix).
 */
export function InlineNotice({
  tone = 'info',
  title,
  children,
  action,
  role = 'note',
  icon,
  id,
  className,
}: InlineNoticeProps): React.ReactElement {
  const styles = TONE_STYLES[tone];
  const Icon = icon === false ? null : (icon ?? styles.Icon);
  return (
    <div
      id={id}
      role={role}
      className={cn(
        'flex gap-3 rounded-md border px-3 py-2.5 text-sm text-foreground',
        styles.box,
        className,
      )}
    >
      {Icon ? <Icon className={cn('mt-0.5 size-4 shrink-0', styles.icon)} aria-hidden="true" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {title ? <p className="font-medium">{title}</p> : null}
          {children ? <div>{children}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
