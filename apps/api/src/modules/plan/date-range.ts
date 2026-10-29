import { BadRequestException } from '@nestjs/common';

/** Convierte una fecha a texto dd/mm/aaaa (UTC) para mensajes al usuario. */
function fmt(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** PLA-01/PLA-04: la fecha de fin no puede ser anterior a la de inicio. */
export function assertValidRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
  label: 'fase' | 'tarea',
): void {
  if (start && end && end.getTime() < start.getTime()) {
    throw new BadRequestException(
      `La fecha de finalización de la ${label} (${fmt(end)}) no puede ser anterior a su fecha de inicio (${fmt(start)}).`,
    );
  }
}

/** PLA-05: las fechas de la tarea deben estar dentro del rango de su fase. */
export function assertTaskWithinPhase(
  task: { start: Date | null | undefined; end: Date | null | undefined; title?: string },
  phase: { name: string; startDate: Date | null; endDate: Date | null },
): void {
  const who = task.title ? `La tarea "${task.title}"` : 'La tarea';
  if (task.start && phase.startDate && task.start.getTime() < phase.startDate.getTime()) {
    throw new BadRequestException(
      `${who} no puede iniciar (${fmt(task.start)}) antes del inicio de la fase "${phase.name}" (${fmt(phase.startDate)}).`,
    );
  }
  if (task.end && phase.endDate && task.end.getTime() > phase.endDate.getTime()) {
    throw new BadRequestException(
      `${who} no puede finalizar (${fmt(task.end)}) después del fin de la fase "${phase.name}" (${fmt(phase.endDate)}).`,
    );
  }
  // Una tarea con una sola fecha también debe respetar ambos límites.
  if (task.start && phase.endDate && task.start.getTime() > phase.endDate.getTime()) {
    throw new BadRequestException(
      `${who} inicia (${fmt(task.start)}) después del fin de la fase "${phase.name}" (${fmt(phase.endDate)}).`,
    );
  }
  if (task.end && phase.startDate && task.end.getTime() < phase.startDate.getTime()) {
    throw new BadRequestException(
      `${who} finaliza (${fmt(task.end)}) antes del inicio de la fase "${phase.name}" (${fmt(phase.startDate)}).`,
    );
  }
}
