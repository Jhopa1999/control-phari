'use client';

import * as React from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskStatus } from '@/lib/api-client';
import { formatPercent } from '@/lib/format';
import { taskStatusLabel } from '@/lib/tasks';
import { nextTaskStatuses } from '@/lib/task-transitions';

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
}: TaskStatusControlProps): React.ReactElement {
  const transitions = nextTaskStatuses(status as TaskStatus);
  const reasonId = React.useId();
  // Sin transiciones ofrecidas no hay nada que elegir: solo lectura.
  const isDisabled = disabled || busy || transitions.length === 0;
  const reason =
    disabledReason ??
    (transitions.length === 0 ? 'No hay transiciones disponibles desde este estado.' : undefined);
  const describedBy = isDisabled && reason ? reasonId : undefined;
  const statusLabel = taskStatusLabel(status);

  return (
    <span className="inline-flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto gap-1.5 px-1.5 py-1"
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
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {transitions.map((next) => (
            <DropdownMenuItem key={next} onSelect={() => onChange(next)}>
              {taskStatusLabel(next)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-meta tabular-nums text-muted-foreground">
        <span className="sr-only">avance </span>
        {formatPercent(progress)}
      </span>
      {describedBy ? (
        <span id={reasonId} hidden>
          {reason}
        </span>
      ) : null}
    </span>
  );
}
