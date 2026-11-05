'use client';

import * as React from 'react';
import { LoaderCircle, Pencil } from 'lucide-react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Field } from '@/components/field';
import { TaskProgressBar, type ProgressTone } from '@/components/task-progress';
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
import { Input } from '@/components/ui/input';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const SHORTCUTS = [0, 25, 50, 75, 100] as const;

export interface TaskProgressControlProps {
  /** Avance actual (0-100). */
  value: number;
  /** Estado de la tarea: decide si el avance se puede editar. */
  status: string;
  taskTitle: string;
  tone?: ProgressTone;
  /** Deshabilitado (sin permiso o fila ocupada). */
  disabled?: boolean;
  disabledReason?: string;
  /** Hay una acción en curso para esta fila. */
  busy?: boolean;
  /** Barra a todo el ancho (kanban y detalle). */
  wide?: boolean;
  /** Clases extra del botón (p. ej. objetivo táctil de 44 px). */
  className?: string;
  /**
   * Guarda el avance. Devuelve null si salió bien o el mensaje de error (el
   * diálogo se queda abierto con lo escrito).
   */
  onSave: (value: number) => Promise<string | null>;
}

/** Motivo por el que el avance no se puede editar según el estado (espejo del backend). */
export function progressLockedReason(status: string): string | undefined {
  if (status === 'POR_HACER') return 'Pasa la tarea a «En curso» para registrar su avance.';
  if (status === 'TERMINADA') return 'La tarea está terminada. Reábrela para cambiar su avance.';
  return undefined;
}

function parseProgress(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Avance en línea: barra + porcentaje que, al pulsarlos, abren un diálogo corto
 * con deslizador, número y atajos (0, 25, 50, 75, 100) y un «Guardar» explícito.
 * Evita entrar al detalle de la tarea solo para cambiar el porcentaje. Las
 * reglas de qué estados lo admiten las decide el backend; aquí solo se refleja
 * el motivo para no ofrecer una acción que fallaría.
 */
export function TaskProgressControl({
  value,
  status,
  taskTitle,
  tone = 'default',
  disabled = false,
  disabledReason,
  busy = false,
  wide = false,
  className,
  onSave,
}: TaskProgressControlProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(String(value));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reasonId = React.useId();

  const lockedReason = progressLockedReason(status);
  const reason = disabledReason ?? lockedReason;
  const isDisabled = disabled || busy || lockedReason !== undefined;
  const describedBy = isDisabled && reason ? reasonId : undefined;

  // Cada vez que se abre, parte del valor vigente.
  useResetOnChange([open], () => {
    if (!open) return;
    setText(String(value));
    setError(null);
  });

  const parsed = parseProgress(text);
  const invalid = parsed === null;
  const unchanged = parsed === value;

  async function handleSave(): Promise<void> {
    if (parsed === null || saving) return;
    setSaving(true);
    setError(null);
    const message = await onSave(parsed);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          '-mx-1.5 h-auto gap-2 px-1.5 py-1 pointer-coarse:min-h-10',
          wide ? 'w-full justify-start' : 'justify-start',
          className,
        )}
        disabled={isDisabled}
        aria-busy={busy || undefined}
        aria-describedby={describedBy}
        aria-label={`Actualizar avance de «${taskTitle}» (actual: ${formatPercent(value)})`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : null}
        <TaskProgressBar value={value} tone={tone} className={wide ? 'w-full min-w-16 flex-1' : 'w-20'} />
        <span className="w-10 shrink-0 text-right text-sm tabular-nums">{formatPercent(value)}</span>
        {!isDisabled ? (
          <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
      </Button>
      {describedBy ? (
        <span id={reasonId} hidden>
          {reason}
        </span>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => (saving ? undefined : setOpen(next))}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Avance de la tarea</DialogTitle>
            <DialogDescription className="wrap-break-word">{taskTitle}</DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogBody className="grid gap-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">Avance</span>
                <span className="text-2xl font-bold tabular-nums" aria-hidden="true">
                  {parsed === null ? '—' : formatPercent(parsed)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={parsed ?? 0}
                aria-label="Deslizador de avance"
                disabled={saving}
                onChange={(event) => setText(event.target.value)}
                className="h-2 w-full cursor-pointer accent-primary"
              />
              <div className="flex flex-wrap items-end gap-3">
                <Field
                  id="task-progress-number"
                  label="Porcentaje"
                  error={invalid ? 'Escribe un número entero entre 0 y 100.' : null}
                  className="w-28"
                >
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    value={text}
                    disabled={saving}
                    className="tabular-nums"
                    onChange={(event) => setText(event.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Valores rápidos">
                  {SHORTCUTS.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="px-2 tabular-nums"
                      aria-pressed={parsed === n}
                      disabled={saving}
                      onClick={() => setText(String(n))}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
              {error ? (
                <p role="alert" className="text-meta text-danger">
                  {`No se pudo guardar el avance: ${error}`}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving} disabled={invalid || unchanged}>
                {saving ? 'Guardando…' : 'Guardar avance'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
