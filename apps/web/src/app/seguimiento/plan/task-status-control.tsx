'use client';

import * as React from 'react';
import { ArrowRightLeft, ChevronDown, LoaderCircle } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskStatus } from '@/lib/api-client';
import { formatPercent } from '@/lib/format';
import { taskStatusLabel } from '@/lib/tasks';
import { orderTransitions } from '@/lib/task-next-step';
import { nextTaskStatuses } from '@/lib/task-transitions';
import { cn } from '@/lib/utils';

export interface TaskStatusControlProps {
  /** Estado actual de la tarea (código de TaskStatus; puede venir como string del DTO). */
  status: string;
  /** Avance actual; se conserva junto al control como hoy. */
  progress: number;
  /** Deshabilitado (plan no editable, fuera de permiso del actor, o fila ocupada). */
  disabled: boolean;
  /** Motivo accesible cuando `disabled`. */
  disabledReason?: string;
  /** Hay una acción en curso para ESTA fila. */
  busy: boolean;
  /** Dispara una transición; solo se invoca con un estado ofrecido. */
  onChange: (next: TaskStatus) => void;
  /** Título de la tarea, para el nombre accesible del disparador. */
  taskTitle: string;
  /** Muestra el % de avance junto al estado (por defecto sí; la tabla lo tiene en su columna). */
  showProgress?: boolean;
  /**
   * Verbo de acción de cada opción del menú («Enviar a revisión»…). Si falta, se
   * muestra el nombre del estado como hasta ahora. Cuando se da, la primera
   * opción (avance natural) se marca como «Siguiente paso» y las demás van
   * tras un separador.
   */
  optionLabel?: (next: TaskStatus) => string;
  /** Clases extra del disparador (p. ej. objetivo táctil de 44 px). */
  triggerClassName?: string;
  /**
   * 'badge' (por defecto): el chip de estado abre el menú. 'move': botón de icono
   * «Mover a…» (tarjeta del tablero), donde el estado ya lo dice la columna.
   */
  triggerVariant?: 'badge' | 'move';
  /** Aviso no bloqueante bajo una opción (p. ej. que aún espera una predecesora); el servidor manda. */
  optionHint?: (next: TaskStatus) => string | undefined;
  /** Id de un texto visible que explica el estado deshabilitado (aria-describedby). */
  describedById?: string;
  /**
   * El actor puede aprobar (jefe de área o líder de proceso): solo entonces se
   * ofrecen «Terminar» y «Reabrir». Guía la UI; el servidor decide (403).
   */
  canApprove: boolean;
}

/**
 * Control de estado en línea de una fila del listado de tareas (planificación).
 * Estilo JIRA/Azure DevOps: el chip de estado abre un menú con SOLO las
 * transiciones válidas desde el estado actual (espejo del backend; el control
 * real es server-side, 409). Es una acción («mover a…»), por eso usa
 * `DropdownMenu` (como `RowActions`) y no un `Select`. El % de avance se
 * conserva fuera del disparador para no perder información (design §3.5).
 */
export function TaskStatusControl({
  status,
  progress,
  disabled,
  disabledReason,
  busy,
  onChange,
  taskTitle,
  showProgress = true,
  optionLabel,
  triggerClassName,
  triggerVariant = 'badge',
  optionHint,
  describedById,
  canApprove,
}: TaskStatusControlProps): React.ReactElement {
  const transitions = nextTaskStatuses(status as TaskStatus, canApprove);
  // Con verbos de acción (Mi trabajo) el siguiente paso natural va primero y es
  // el único rotulado «Siguiente paso»; sin ellos (Planificación) el menú queda
  // como siempre.
  const { ordered, naturalFirst } = optionLabel
    ? orderTransitions(status, transitions, canApprove)
    : { ordered: [...transitions], naturalFirst: false };
  const reasonId = React.useId();
  // Sin transiciones ofrecidas no hay nada que elegir: solo lectura.
  const isDisabled = disabled || busy || transitions.length === 0;
  const reason =
    disabledReason ??
    (transitions.length === 0
      ? status === 'TERMINADA' && !canApprove
        ? 'Solo un líder o el jefe de área puede reabrir una tarea terminada.'
        : 'No hay transiciones disponibles desde este estado.'
      : undefined);
  const describedBy = describedById ?? (isDisabled && reason ? reasonId : undefined);
  const isMove = triggerVariant === 'move';
  const statusLabel = taskStatusLabel(status);

  return (
    <span className="inline-flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {isMove ? (
            <Button
              variant="outline"
              size="sm"
              className={cn('size-8 shrink-0 px-0', triggerClassName)}
              disabled={isDisabled}
              aria-busy={busy || undefined}
              aria-describedby={describedBy}
              aria-label={`Mover «${taskTitle}» a…`}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <ArrowRightLeft className="size-4" aria-hidden="true" />
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-auto gap-1.5 px-1.5 py-1', triggerClassName)}
              disabled={isDisabled}
              aria-busy={busy || undefined}
              aria-describedby={describedBy}
              aria-label={`Cambiar estado de «${taskTitle}» (actual: ${statusLabel})`}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : null}
              <StatusBadge kind="task" value={status} />
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {ordered.map((next, index) => (
            <React.Fragment key={next}>
              {optionLabel && naturalFirst && index === 1 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onSelect={() => onChange(next)}>
                {optionLabel ? (
                  <span className="flex flex-col">
                    <span>{optionLabel(next)}</span>
                    {naturalFirst && index === 0 ? (
                      <span className="text-meta text-muted-foreground">Siguiente paso</span>
                    ) : null}
                    {optionHint?.(next) ? (
                      <span className="max-w-64 text-meta text-warning">{optionHint(next)}</span>
                    ) : null}
                  </span>
                ) : (
                  taskStatusLabel(next)
                )}
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {showProgress ? (
        <span className="text-meta tabular-nums text-muted-foreground">
          <span className="sr-only">avance </span>
          {formatPercent(progress)}
        </span>
      ) : null}
      {describedBy ? (
        <span id={reasonId} hidden>
          {reason}
        </span>
      ) : null}
    </span>
  );
}
