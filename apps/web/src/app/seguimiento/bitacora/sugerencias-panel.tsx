'use client';

import * as React from 'react';
import {
  Check,
  ChevronDown,
  CircleCheck,
  FilePen,
  ListChecks,
  Pencil,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DisabledReason } from '@/components/disabled-reason';
import { IdChip } from '@/components/id-chip';
import { InlineNotice, type InlineNoticeTone } from '@/components/inline-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailyLog, DailySuggestions, Suggestion } from '@/lib/api-client';
import { formatDuration, formatHours, formatTimeRange } from '@/lib/format';
import { describeTaskChange } from '@/lib/task-history';
import {
  WorklogError,
  acceptSuggestions,
  dismissSuggestions,
  getDailySuggestions,
  restoreSuggestions,
} from '@/lib/worklog';
import { cn } from '@/lib/utils';
import { ClassificationBadge } from './clasificaciones';
import {
  HOURS_RANGE_MESSAGE,
  HOURS_STEP_HELP,
  HoursInput,
  hoursFromText,
  isValidHoursText,
} from './hours-input';

/** Filas visibles antes de «Ver las N restantes». */
const VISIBLE_LIMIT = 5;

type LoadState = 'loading' | 'success' | 'error';

interface PanelNotice {
  tone: InlineNoticeTone;
  text: string;
}

export interface SugerenciasPanelProps {
  dailyLog: DailyLog;
  /** Cambia cuando el diario se recargó: se vuelven a pedir las sugerencias. */
  version: number;
  /** Cada incremento abre el panel (p. ej. «Ir a las sugerencias» del formulario). */
  expandSignal: number;
  /** Tras aceptar: el padre recarga el diario y lleva el foco a las actividades nuevas. */
  onAccepted: (activityIds: string[]) => Promise<void>;
  /** El autor retira el envío (solo se ofrece si la API lo permite). */
  onRecall?: () => void;
}

function messageOf(err: unknown): string {
  return err instanceof WorklogError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function completedAtText(iso: string): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

/** Horas propuestas como texto del campo (vacío si el usuario debe indicarlas). */
function defaultHoursText(s: Suggestion): string {
  return s.suggestedHours === null ? '' : String(s.suggestedHours);
}

function pendingLabel(count: number): string {
  return `${count} ${count === 1 ? 'sugerencia pendiente' : 'sugerencias pendientes'}`;
}

/**
 * «Tiempo del día sin registrar»: reuniones, actividades recurrentes y tareas
 * que la API propone como actividades del diario. Aquí solo se presentan y se
 * aceptan, ajustan o descartan; qué se sugiere y cuántas horas lo decide la API.
 */
export function SugerenciasPanel({
  dailyLog,
  version,
  expandSignal,
  onAccepted,
  onRecall,
}: SugerenciasPanelProps): React.ReactElement | null {
  const [data, setData] = React.useState<DailySuggestions | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [attempt, setAttempt] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);
  const [showDismissed, setShowDismissed] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [hoursText, setHoursText] = React.useState<Record<string, string>>({});
  const [adjusting, setAdjusting] = React.useState<ReadonlySet<string>>(new Set());
  const [busyKeys, setBusyKeys] = React.useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<PanelNotice | null>(null);
  const [live, setLive] = React.useState('');
  const bodyId = `sug-body-${dailyLog.id}`;
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const logId = dailyLog.id;

  React.useEffect(() => {
    let active = true;
    getDailySuggestions(logId, showDismissed)
      .then((res) => {
        if (!active) return;
        setData(res);
        setState('success');
      })
      .catch(() => {
        if (!active) return;
        // Un fallo al recargar no borra lo que ya se mostraba.
        setState((prev) => (prev === 'success' ? prev : 'error'));
      });
    return () => {
      active = false;
    };
  }, [logId, showDismissed, version, attempt]);

  React.useEffect(() => {
    if (expandSignal > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacciona a la señal del padre («Ir a las sugerencias»).
      setExpanded(true);
      toggleRef.current?.focus();
    }
  }, [expandSignal]);

  const items = React.useMemo(() => data?.items ?? [], [data]);
  const pending = React.useMemo(() => items.filter((s) => s.status === 'SUGGESTED'), [items]);
  const dismissed = React.useMemo(() => items.filter((s) => s.status === 'DISMISSED'), [items]);
  const ordered = React.useMemo(() => [...pending, ...dismissed], [pending, dismissed]);

  function textFor(s: Suggestion): string {
    return hoursText[s.key] ?? defaultHoursText(s);
  }

  function setBusy(keys: string[], busy: boolean): void {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (busy) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  function startAdjusting(s: Suggestion): void {
    setAdjusting((prev) => new Set(prev).add(s.key));
    // El foco va al campo de horas de la fila.
    requestAnimationFrame(() => document.getElementById(`sug-h-${s.key}`)?.focus());
  }

  function stopAdjusting(s: Suggestion): void {
    setAdjusting((prev) => {
      const next = new Set(prev);
      next.delete(s.key);
      return next;
    });
    setHoursText((prev) => {
      const next = { ...prev };
      delete next[s.key];
      return next;
    });
  }

  /** Horas que se envían al aceptar: solo si se ajustaron o la API no propuso ninguna. */
  function hoursToSend(s: Suggestion): { hours?: number } | null {
    if (s.suggestedHours !== null && !adjusting.has(s.key)) return {};
    const text = textFor(s);
    if (!isValidHoursText(text)) return null;
    return { hours: hoursFromText(text) };
  }

  async function accept(targets: Suggestion[]): Promise<void> {
    const payload: { key: string; hours?: number }[] = [];
    for (const s of targets) {
      const extra = hoursToSend(s);
      if (!extra) continue;
      payload.push({ key: s.key, ...extra });
    }
    if (payload.length === 0) return;
    const keys = payload.map((p) => p.key);
    setBusy(keys, true);
    if (targets.length > 1) setBulkBusy(true);
    setNotice(null);
    try {
      const result = await acceptSuggestions(logId, payload);
      const titleOf = (key: string) => items.find((s) => s.key === key)?.title ?? 'la sugerencia';
      if (result.accepted.length > 0) {
        const first = result.accepted[0];
        const text =
          result.accepted.length === 1
            ? `Registrado: ${titleOf(keys[0])} · ${formatHours(first.hours)}`
            : `Se registraron ${result.accepted.length} actividades.`;
        toast.success(text);
        setLive(result.accepted.length === 1 ? 'Sugerencia aceptada.' : text);
      }
      if (result.failed.length > 0) {
        const alreadyOnly = result.failed.every((f) => f.code === 'YA_REGISTRADA');
        const detail = result.failed
          .map((f) => `${titleOf(f.key)} (${f.message})`)
          .join('; ');
        setNotice(
          alreadyOnly
            ? {
                tone: 'info',
                text: 'Esa sugerencia ya está registrada en otro diario del mismo día.',
              }
            : {
                tone: 'warning',
                text:
                  payload.length > 1
                    ? `Se registraron ${result.accepted.length} de ${payload.length}. No se pudo registrar: ${detail}`
                    : `No se pudo registrar: ${detail}`,
              },
        );
      }
      await onAccepted(result.accepted.map((a) => a.id));
    } catch (err) {
      const message = messageOf(err);
      setNotice({ tone: 'warning', text: message });
      toast.error(message);
    } finally {
      setBusy(keys, false);
      setBulkBusy(false);
    }
  }

  async function dismiss(s: Suggestion): Promise<void> {
    setBusy([s.key], true);
    setNotice(null);
    try {
      await dismissSuggestions(logId, [s.key]);
      toast.success('Sugerencia descartada.');
      setLive('Sugerencia descartada.');
      setAttempt((n) => n + 1);
    } catch (err) {
      const message = messageOf(err);
      setNotice({ tone: 'warning', text: message });
      toast.error(message);
    } finally {
      setBusy([s.key], false);
    }
  }

  async function restore(s: Suggestion): Promise<void> {
    setBusy([s.key], true);
    setNotice(null);
    try {
      await restoreSuggestions(logId, [s.key]);
      toast.success('Sugerencia restaurada.');
      setLive('Sugerencia restaurada.');
      setAttempt((n) => n + 1);
    } catch (err) {
      const message = messageOf(err);
      setNotice({ tone: 'warning', text: message });
      toast.error(message);
    } finally {
      setBusy([s.key], false);
    }
  }

  // --- Estados ---
  if (state === 'loading' && !data) {
    return (
      <div
        aria-busy="true"
        className="flex flex-col gap-2 rounded-xl border-t-2 border-t-primary bg-card p-4 shadow-card"
      >
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-9 w-48" />
      </div>
    );
  }
  if (state === 'error' && !data) {
    return (
      <InlineNotice
        tone="warning"
        role="status"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          >
            Reintentar
          </Button>
        }
      >
        No se pudieron cargar las sugerencias del día.
      </InlineNotice>
    );
  }
  if (!data) return null;

  // Diario enviado o revisado: nada se acepta; solo se avisa si quedó tiempo sin registrar.
  if (!data.editable) {
    if (data.pendingCount === 0) return null;
    const count = data.pendingCount;
    return (
      <InlineNotice
        tone="info"
        title={`Hay tiempo de este día sin registrar (${count} ${count === 1 ? 'sugerencia' : 'sugerencias'}).`}
        action={
          onRecall ? (
            <Button type="button" variant="outline" size="sm" onClick={onRecall}>
              Retirar envío
            </Button>
          ) : undefined
        }
      >
        Para añadirlo, pide que te devuelvan el diario{onRecall ? ' o retira el envío' : ''}.
      </InlineNotice>
    );
  }

  const allDone = data.pendingCount === 0;
  const visible = showAll ? ordered : ordered.slice(0, VISIBLE_LIMIT);
  const hiddenCount = ordered.length - visible.length;
  const acceptable = pending.filter((s) => hoursToSend(s) !== null);

  return (
    <section
      aria-labelledby={`sug-title-${logId}`}
      className={cn(
        'flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card',
        allDone ? 'border-t-0' : 'border-t-2 border-t-primary',
      )}
    >
      <p role="status" className="sr-only">
        {live}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4 text-link" />
            <h3
              id={`sug-title-${logId}`}
              ref={headingRef}
              className="text-base font-semibold"
            >
              Tiempo del día sin registrar
            </h3>
            <Badge variant="accent" className="tabular-nums">
              {data.pendingCount}
              <span className="sr-only"> {pendingLabel(data.pendingCount).replace(/^\d+ /, '')}</span>
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Reuniones, actividades recurrentes y tareas que trabajaste este día. Aceptas lo que sea
            correcto.
          </p>
        </div>
        {allDone ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <CircleCheck aria-hidden="true" className="size-4 text-success" />
              Todo registrado
            </span>
            {data.dismissedCount > 0 ? (
              <Button
                ref={toggleRef}
                type="button"
                variant="link"
                size="sm"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => {
                  setExpanded(true);
                  setShowDismissed(true);
                }}
              >
                Ver descartadas ({data.dismissedCount})
              </Button>
            ) : null}
          </div>
        ) : (
          <Button
            ref={toggleRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((v) => !v)}
          >
            <ListChecks aria-hidden="true" />
            Revisar sugerencias del día
            <ChevronDown
              aria-hidden="true"
              className={cn('transition-transform motion-reduce:transition-none', expanded && 'rotate-180')}
            />
          </Button>
        )}
      </div>

      {allDone && data.pendingCount === 0 && data.dismissedCount === 0 && dailyLog.activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No encontramos reuniones, recurrentes ni tareas de este día.
        </p>
      ) : null}

      <div id={bodyId} hidden={!expanded} className="flex flex-col gap-3">
        {expanded ? (
          <>
            {notice ? (
              <InlineNotice tone={notice.tone} role={notice.tone === 'info' ? 'status' : 'alert'}>
                {notice.text}
              </InlineNotice>
            ) : null}
            {ordered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay sugerencias para mostrar.</p>
            ) : (
              <ul aria-label="Sugerencias de tiempo del día" className="flex flex-col gap-2">
                {visible.map((s) => (
                  <SuggestionRow
                    key={s.key}
                    suggestion={s}
                    dailyLogProcessId={dailyLog.processId}
                    hours={textFor(s)}
                    adjusting={adjusting.has(s.key)}
                    busy={busyKeys.has(s.key)}
                    onHoursChange={(text) => setHoursText((prev) => ({ ...prev, [s.key]: text }))}
                    onAdjust={() => startAdjusting(s)}
                    onCancelAdjust={() => stopAdjusting(s)}
                    onAccept={() => void accept([s])}
                    onDismiss={() => void dismiss(s)}
                    onRestore={() => void restore(s)}
                  />
                ))}
              </ul>
            )}
            {hiddenCount > 0 ? (
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                  Ver las {hiddenCount} restantes
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex flex-col items-start gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={bulkBusy}
                  unavailable={acceptable.length === 0}
                  aria-describedby={acceptable.length === 0 ? `sug-all-reason-${logId}` : undefined}
                  onClick={() => void accept(acceptable)}
                >
                  <Check aria-hidden="true" />
                  Aceptar todas con horas
                </Button>
                {acceptable.length === 0 ? (
                  <DisabledReason id={`sug-all-reason-${logId}`}>
                    Ninguna sugerencia tiene horas todavía.
                  </DisabledReason>
                ) : null}
              </div>
              {data.dismissedCount > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setShowDismissed((v) => !v)}
                >
                  {showDismissed ? 'Ocultar descartadas' : `Ver descartadas (${data.dismissedCount})`}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

interface SuggestionRowProps {
  suggestion: Suggestion;
  dailyLogProcessId: string;
  hours: string;
  adjusting: boolean;
  busy: boolean;
  onHoursChange: (text: string) => void;
  onAdjust: () => void;
  onCancelAdjust: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}

function SuggestionRow({
  suggestion: s,
  dailyLogProcessId,
  hours,
  adjusting,
  busy,
  onHoursChange,
  onAdjust,
  onCancelAdjust,
  onAccept,
  onDismiss,
  onRestore,
}: SuggestionRowProps): React.ReactElement {
  const dismissed = s.status === 'DISMISSED';
  const editable = !dismissed && (s.requiresHoursInput || adjusting);
  const valid = isValidHoursText(hours);
  const showError = editable && hours.trim() !== '' && !valid;
  const reasonId = `sug-r-${s.key}`;
  const errorId = `sug-e-${s.key}`;
  const helpId = `sug-p-${s.key}`;
  const acceptUnavailable = editable && !valid;

  return (
    <li
      aria-busy={busy || undefined}
      className="flex flex-col gap-2 rounded-lg bg-surface-subtle px-3 py-3"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <ClassificationBadge code={s.classificationCode} />
          {s.task ? <IdChip code={s.task.code} variant="full" copyable={false} /> : null}
          <span className="min-w-0 font-medium wrap-break-word" title={s.title}>
            {s.task ? s.task.title : s.title}
          </span>
          {dismissed ? <Badge variant="neutral">Descartada</Badge> : null}
        </div>

        {s.meeting ? (
          <div className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
            <span className="tabular-nums">
              {[
                formatTimeRange(s.meeting.time, s.meeting.endTime),
                s.meeting.durationMinutes ? formatDuration(s.meeting.durationMinutes) : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Sin hora registrada'}
            </span>
            <span>{s.meeting.processName}</span>
            {s.meeting.minutesOpen ? (
              <Badge
                variant="warning"
                title="El acta aún no está cerrada; puedes aceptar igual."
              >
                <FilePen aria-hidden="true" />
                Acta en borrador
              </Badge>
            ) : null}
            {s.meeting.processId !== dailyLogProcessId ? (
              <Badge variant="outline">{s.meeting.processName}</Badge>
            ) : null}
          </div>
        ) : null}

        {s.occurrence ? (
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="text-meta text-muted-foreground">
              Completada a las {completedAtText(s.occurrence.completedAt)}
            </span>
            {s.description ? (
              <p className="line-clamp-2 wrap-break-word" title={s.description}>
                {s.description}
              </p>
            ) : null}
            {s.hoursAdjusted && s.originalHours !== null && s.suggestedHours !== null ? (
              <span className="text-meta text-muted-foreground">
                Registraste {formatHours(s.originalHours)}; se propone {formatHours(s.suggestedHours)}
              </span>
            ) : null}
          </div>
        ) : null}

        {s.task ? (
          <div className="flex flex-col gap-1">
            <span className="text-meta text-muted-foreground">
              {s.task.requestCode} · {s.task.projectTitle}
            </span>
            {s.task.reasons.length > 0 ? (
              <ul aria-label="Cambios de la tarea" className="flex flex-wrap gap-1.5">
                {s.task.reasons.map((reason) => {
                  const shown = describeTaskChange(reason);
                  return (
                    <li key={reason.field}>
                      <Badge variant="neutral">
                        {`${shown.label}: ${shown.from ?? '—'} → ${shown.to ?? '—'}`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {!dismissed ? (
        <div className="flex flex-col gap-1">
          {editable ? (
            <>
              <label htmlFor={`sug-h-${s.key}`} className="text-meta font-medium">
                Horas
              </label>
              <HoursInput
                id={`sug-h-${s.key}`}
                value={hours}
                placeholder="0,25"
                aria-invalid={showError || undefined}
                aria-describedby={[helpId, showError ? errorId : null].filter(Boolean).join(' ')}
                onChange={(e) => onHoursChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (valid) onAccept();
                  }
                }}
              />
              <span id={helpId} className="text-meta text-muted-foreground">
                {s.requiresHoursInput && !adjusting
                  ? '¿Cuánto tiempo le dedicaste? '
                  : ''}
                {HOURS_STEP_HELP}
              </span>
              {showError ? (
                <span id={errorId} className="text-meta text-danger">
                  {HOURS_RANGE_MESSAGE}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-lg font-semibold tabular-nums">
                {formatHours(s.suggestedHours ?? 0)}
              </span>
              <span className="text-meta text-muted-foreground">propuestas</span>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 max-sm:[&>button]:flex-1">
        {dismissed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11 max-sm:min-h-11"
            loading={busy}
            aria-label={`Restaurar sugerencia: ${s.title}`}
            onClick={onRestore}
          >
            <Undo2 aria-hidden="true" />
            Restaurar
          </Button>
        ) : (
          <>
            {adjusting ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="pointer-coarse:min-h-11 max-sm:min-h-11"
                  loading={busy}
                  unavailable={acceptUnavailable}
                  aria-describedby={acceptUnavailable ? reasonId : undefined}
                  aria-label={`Aceptar sugerencia con ${valid ? formatHours(hoursFromText(hours)) : 'las horas indicadas'}: ${s.title}`}
                  onClick={onAccept}
                >
                  <Check aria-hidden="true" />
                  {valid ? `Aceptar con ${formatHours(hoursFromText(hours))}` : 'Aceptar con horas'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:min-h-11 max-sm:min-h-11"
                  onClick={onCancelAdjust}
                >
                  Cancelar ajuste
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="pointer-coarse:min-h-11 max-sm:min-h-11"
                  loading={busy}
                  unavailable={acceptUnavailable}
                  aria-describedby={acceptUnavailable ? reasonId : undefined}
                  aria-label={`Aceptar sugerencia: ${s.title}`}
                  onClick={onAccept}
                >
                  <Check aria-hidden="true" />
                  Aceptar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="pointer-coarse:min-h-11 max-sm:min-h-11"
                  disabled={busy}
                  aria-label={`Ajustar horas y aceptar: ${s.title}`}
                  onClick={onAdjust}
                >
                  <Pencil aria-hidden="true" />
                  Ajustar horas y aceptar
                </Button>
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:min-h-11 max-sm:min-h-11"
              disabled={busy}
              aria-label={`Descartar sugerencia: ${s.title}`}
              onClick={onDismiss}
            >
              <X aria-hidden="true" />
              Descartar
            </Button>
            {acceptUnavailable ? (
              <DisabledReason id={reasonId} className="basis-full">
                Indica las horas para aceptar
              </DisabledReason>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
