'use client';

import * as React from 'react';
import type { Task, TaskStatus } from '@/lib/api-client';
import { PlanError } from '@/lib/plan';
import { updateTaskProgress, updateTaskStatus } from '@/lib/tasks';

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

export interface UseInlineTaskActionsOptions<T extends { status: string; progress: number }> {
  /** Actualiza la lista de elementos que pinta la vista. */
  setItems: (updater: (prev: T[]) => T[]) => void;
  /** Id de la tarea de un elemento (`id` en Task, `taskId` en MyWorkItem). */
  getId: (item: T) => string;
  /**
   * Bloqueo global de la vista: si es true, el estado no hace nada y el avance
   * devuelve un error. Planificación lo usa; Mi trabajo no.
   */
  busyExternal?: boolean;
  /**
   * Cómo queda el elemento tras el éxito. Por defecto se fusionan solo `status`
   * y `progress` de la tarea devuelta (PATCH /tasks/:id/status no trae
   * phaseName ni requestTitle). Planificación, cuyo elemento ES una Task, la
   * reemplaza completa.
   */
  merge?: (item: T, updated: Task) => T;
  /** El LLAMADOR pone el toast de éxito y cualquier refresco posterior. */
  onStatusSuccess?: (updated: Task, prev: T) => void | Promise<void>;
  /** Se invoca con el mensaje del servidor cuando el cambio falla (tras revertir). */
  onStatusError: (message: string) => void;
}

export interface InlineTaskActions<T> {
  /** Fila con una acción en curso (una a la vez). */
  rowBusyId: string | null;
  /** También lo usa el cambio de responsable, que comparte la marca de fila ocupada. */
  setRowBusyId: (id: string | null) => void;
  /** Cambio de estado optimista. Devuelve la tarea o null si falló (ya revertido). */
  changeStatus: (item: T, status: TaskStatus, extra?: { progress?: number }) => Promise<Task | null>;
  /** Cambio de avance (no optimista). Devuelve la tarea o el mensaje del servidor. */
  changeProgress: (item: T, progress: number) => Promise<{ task: Task } | { error: string }>;
}

/**
 * Cambio de estado y de avance en línea (PATCH /tasks/{id}/status y /progress),
 * compartido por Planificación y Mi trabajo para no duplicar la fuente de
 * verdad. El estado es optimista con reversión; el backend manda: en 403/409 se
 * revierte y se entrega su mensaje accionable a `onStatusError`.
 */
export function useInlineTaskActions<T extends { status: string; progress: number }>({
  setItems,
  getId,
  busyExternal = false,
  merge,
  onStatusSuccess,
  onStatusError,
}: UseInlineTaskActionsOptions<T>): InlineTaskActions<T> {
  const [rowBusyId, setRowBusyId] = React.useState<string | null>(null);

  const apply = React.useCallback(
    (id: string, updated: Task) => {
      setItems((prev) =>
        prev.map((it) =>
          getId(it) === id
            ? merge
              ? merge(it, updated)
              : { ...it, status: updated.status, progress: updated.progress }
            : it,
        ),
      );
    },
    [setItems, getId, merge],
  );

  const changeStatus = React.useCallback(
    async (item: T, next: TaskStatus, extra?: { progress?: number }): Promise<Task | null> => {
      if (busyExternal) return null;
      const id = getId(item);
      setRowBusyId(id);
      setItems((prev) => prev.map((it) => (getId(it) === id ? { ...it, status: next } : it)));
      try {
        const updated = await updateTaskStatus(id, { status: next, ...extra });
        apply(id, updated);
        await onStatusSuccess?.(updated, item);
        return updated;
      } catch (err) {
        setItems((prev) => prev.map((it) => (getId(it) === id ? item : it)));
        onStatusError(messageOf(err));
        return null;
      } finally {
        setRowBusyId(null);
      }
    },
    [busyExternal, getId, setItems, apply, onStatusSuccess, onStatusError],
  );

  const changeProgress = React.useCallback(
    async (item: T, progress: number): Promise<{ task: Task } | { error: string }> => {
      if (busyExternal) return { error: 'Hay otra acción en curso. Inténtalo de nuevo en un momento.' };
      const id = getId(item);
      setRowBusyId(id);
      try {
        const updated = await updateTaskProgress(id, progress);
        apply(id, updated);
        return { task: updated };
      } catch (err) {
        return { error: messageOf(err) };
      } finally {
        setRowBusyId(null);
      }
    },
    [busyExternal, getId, apply],
  );

  return { rowBusyId, setRowBusyId, changeStatus, changeProgress };
}
