'use client';

import * as React from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CoordinationPerson } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/** Texto cuando el responsable actual no está entre las personas en alcance. */
const OUT_OF_SCOPE = 'Persona fuera de tu alcance';
/** Texto de solo lectura cuando la tarea no tiene responsable. */
const UNASSIGNED = 'Sin asignar';

export interface TaskResponsibleControlProps {
  /** Responsable actual (userId) o null si no hay. */
  value: string | null;
  /** Personas en alcance ya cargadas en la vista. */
  people: CoordinationPerson[];
  /** La carga de personas falló (distinto de lista vacía legítima). */
  loadError: boolean;
  /** Deshabilitado (plan no editable, fuera de permiso del actor, o fila ocupada). */
  disabled: boolean;
  /** Motivo accesible cuando `disabled`. */
  disabledReason?: string;
  /** Hay una acción en curso para ESTA fila. */
  busy: boolean;
  /** Reasigna a una persona en alcance; nunca `null` (desasignar no existe hoy). */
  onChange: (userId: string) => void;
  /** Título de la tarea, para el nombre accesible del selector. */
  taskTitle: string;
}

/**
 * Selector de responsable en línea de una fila del listado de tareas
 * (planificación). Lista las personas en alcance (`GET /coordination/people`) y
 * reasigna con un clic (`PATCH /tasks/{id}`). No ofrece «Sin asignar» como
 * acción de escritura (desasignar no existe hoy en la app; design §3.9); sí lo
 * muestra en solo lectura cuando la tarea no tiene responsable. Un valor fuera
 * de alcance se muestra como «Persona fuera de tu alcance», nunca un UUID
 * (design §3.6, AC-7).
 */
export function TaskResponsibleControl({
  value,
  people,
  loadError,
  disabled,
  disabledReason,
  busy,
  onChange,
  taskTitle,
}: TaskResponsibleControlProps): React.ReactElement {
  const reasonId = React.useId();
  const inScope = value !== null && people.some((p) => p.id === value);
  // Sin personas (lista vacía o fallo de carga): el selector queda inerte y el
  // valor actual se muestra en solo lectura (design §3.6, AC-8).
  const noPeople = loadError || people.length === 0;
  const isDisabled = disabled || busy || noPeople;
  const reason =
    disabledReason ??
    (loadError
      ? 'No se pudieron cargar las personas'
      : people.length === 0
        ? 'No hay personas disponibles para asignar'
        : undefined);
  const describedBy = isDisabled && reason ? reasonId : undefined;

  // Texto del disparador según el valor actual.
  const currentName =
    value === null ? UNASSIGNED : inScope ? null : OUT_OF_SCOPE;
  const placeholder = currentName ?? UNASSIGNED;
  const unassignedTone = value === null;

  return (
    <span className="inline-flex items-center gap-2">
      <Select
        // Solo se refleja un valor seleccionable cuando está en alcance; en los
        // demás casos el trigger muestra el placeholder de solo lectura.
        value={inScope ? value : undefined}
        onValueChange={onChange}
        disabled={isDisabled}
      >
        <SelectTrigger
          className={cn('min-w-36', unassignedTone && 'text-warning')}
          aria-busy={busy || undefined}
          aria-describedby={describedBy}
          aria-label={`Responsable de «${taskTitle}»`}
        >
          {busy ? (
            <LoaderCircle
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {/* Valor fuera de alcance: item deshabilitado, no seleccionable (AC-7). */}
          {!inScope && value !== null ? (
            <SelectItem value={value} disabled>
              {OUT_OF_SCOPE}
            </SelectItem>
          ) : null}
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {describedBy ? (
        <span id={reasonId} hidden>
          {reason}
        </span>
      ) : null}
    </span>
  );
}
