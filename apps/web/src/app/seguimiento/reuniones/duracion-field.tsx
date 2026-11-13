'use client';

import * as React from 'react';
import { FieldSet } from '@/components/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDuration, formatTimeRange } from '@/lib/format';

/** Valor del control: horas y minutos como texto; '' = sin elegir. */
export interface DuracionParts {
  hours: string;
  minutes: string;
}

export const EMPTY_DURATION: DuracionParts = { hours: '', minutes: '' };

const HOUR_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const MINUTE_OPTIONS = [0, 15, 30, 45];
const NONE = '__none__';

/** Minutos guardados (múltiplo de 15) a los dos selectores. */
export function durationToParts(minutes: number | null | undefined): DuracionParts {
  if (minutes === null || minutes === undefined) return EMPTY_DURATION;
  return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) };
}

/** Selectores a minutos para el cuerpo de la petición; null si no se eligió nada. */
export function partsToMinutes(parts: DuracionParts): number | null {
  if (parts.hours === '' && parts.minutes === '') return null;
  return Number(parts.hours || 0) * 60 + Number(parts.minutes || 0);
}

/**
 * Solo para la vista previa mientras se escribe el formulario. El horario que se
 * guarda y se muestra en listados lo calcula la API (`meetingEndTime`).
 */
function previewEnd(time: string, minutes: number): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const end = Number(match[1]) * 60 + Number(match[2]) + minutes;
  if (end >= 24 * 60) return null;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

export interface DuracionFieldProps {
  id: string;
  value: DuracionParts;
  onChange: (next: DuracionParts) => void;
  /** Hora de inicio HH:mm de la reunión, para la vista previa del horario. */
  meetingTime?: string;
  error?: string | null;
  /** Texto de ayuda; por defecto el de las sugerencias de la bitácora. */
  help?: React.ReactNode;
  hoursRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Duración de la reunión en horas y minutos (0/15/30/45). El paso de 15 minutos
 * coincide con el de la bitácora, así la sugerencia no necesita redondeos.
 */
export function DuracionField({
  id,
  value,
  onChange,
  meetingTime,
  error,
  help = 'Se usa para proponer el tiempo en la bitácora de los participantes.',
  hoursRef,
}: DuracionFieldProps): React.ReactElement {
  const total = partsToMinutes(value);
  const end = total !== null && total > 0 && meetingTime ? previewEnd(meetingTime, total) : null;
  const range = meetingTime && end ? formatTimeRange(meetingTime, end) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldSet id={id} legend="Duración" help={help} error={error}>
        <div className="flex items-center gap-2">
          <Select
            value={value.hours === '' ? NONE : value.hours}
            onValueChange={(v) => onChange({ ...value, hours: v === NONE ? '' : v })}
          >
            <SelectTrigger ref={hoursRef} aria-label="Horas de duración" className="w-24">
              <SelectValue placeholder="Horas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Horas</SelectItem>
              {HOUR_OPTIONS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {`${h} h`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={value.minutes === '' ? NONE : value.minutes}
            onValueChange={(v) => onChange({ ...value, minutes: v === NONE ? '' : v })}
          >
            <SelectTrigger aria-label="Minutos de duración" className="w-28">
              <SelectValue placeholder="Minutos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Minutos</SelectItem>
              {MINUTE_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {`${String(m).padStart(2, '0')} min`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FieldSet>
      <p aria-live="polite" className="text-meta tabular-nums text-muted-foreground">
        {range
          ? `Horario: ${range} (${formatDuration(total ?? 0)})`
          : total !== null && total > 0
            ? `Duración: ${formatDuration(total)}`
            : ''}
      </p>
    </div>
  );
}
