'use client';

import * as React from 'react';
import { CalendarRange } from 'lucide-react';
import { ConfirmDialog, useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  Area,
  CatalogItem,
  CreateRecurringActivity,
  RecurrencePreviewQuery,
  RecurringActivity,
  User,
} from '@/lib/api-client';
import { formatDateOnlyWithWeekday, localDateInputValue } from '@/lib/format';
import { previewDates } from '@/lib/recurring-activities';
import { RECURRENCES, recurrenceUnit } from '@/lib/status-labels';

/**
 * Convierte el valor de fecha del contrato (un @db.Date serializado a
 * medianoche UTC, p. ej. "2024-01-10T00:00:00.000Z") al valor YYYY-MM-DD que
 * espera <input type="date">: la porción de fecha es su día de calendario.
 */
function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** Días de preparación por defecto según la cadencia (semanal 2, resto 5). */
function defaultPrepDays(cadence: string): string {
  return cadence === 'SEMANAL' ? '2' : '5';
}

export interface DefinitionFormValues {
  title: string;
  description: string;
  activityType: string;
  cadence: string;
  intervalCount: string;
  startDate: string;
  endDate: string;
  responsibleKind: 'USER' | 'AREA';
  responsibleUserId: string;
  responsibleAreaId: string;
  active: boolean;
  /** Horas estimadas por ocurrencia (texto del input; se valida > 0). */
  estimatedHours: string;
  /** Días de preparación (texto). */
  prepDays: string;
  /** true cuando el usuario editó los días de preparación (deja de seguir el default). */
  prepTouched: boolean;
  requiresEvidence: boolean;
}

interface DefinitionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: RecurringActivity | null;
  submitting: boolean;
  errorMessage: string | null;
  activityTypes: CatalogItem[];
  users: User[];
  areas: Area[];
  /** `regenerates`: el cambio vuelve a calcular las fechas futuras (se confirmó). */
  onSubmit: (values: CreateRecurringActivity, regenerates: boolean) => void;
}

const FORM_ID = 'recurring-def-form';

function emptyValues(): DefinitionFormValues {
  return {
    title: '',
    description: '',
    activityType: '',
    cadence: 'MENSUAL',
    intervalCount: '1',
    startDate: localDateInputValue(new Date()),
    endDate: '',
    responsibleKind: 'USER',
    responsibleUserId: '',
    responsibleAreaId: '',
    active: true,
    estimatedHours: '',
    prepDays: defaultPrepDays('MENSUAL'),
    prepTouched: false,
    requiresEvidence: false,
  };
}

/** Convierte el texto del input a número (acepta coma decimal). */
function parseDecimal(value: string): number {
  return Number.parseFloat(value.replace(',', '.'));
}

interface Validation {
  title: string | null;
  activityType: string | null;
  intervalCount: string | null;
  startDate: string | null;
  endDate: string | null;
  estimatedHours: string | null;
  prepDays: string | null;
  responsible: string | null;
}

const NO_ERRORS: Validation = {
  title: null,
  activityType: null,
  intervalCount: null,
  startDate: null,
  endDate: null,
  estimatedHours: null,
  prepDays: null,
  responsible: null,
};

/** Orden de los campos para enfocar el primero inválido. */
const FIELD_ORDER: Array<[keyof Validation, string]> = [
  ['title', 'def-title'],
  ['activityType', 'def-type'],
  ['intervalCount', 'def-interval'],
  ['startDate', 'def-start'],
  ['endDate', 'def-end'],
  ['estimatedHours', 'def-hours'],
  ['prepDays', 'def-prep'],
  ['responsible', 'def-user'],
];

/** Reglas mínimas de forma en el cliente; la API es la autoridad. */
function validate(values: DefinitionFormValues): Validation {
  const responsibleOk =
    values.responsibleKind === 'USER'
      ? values.responsibleUserId !== ''
      : values.responsibleAreaId !== '';
  const interval = Number(values.intervalCount);
  const hours = parseDecimal(values.estimatedHours);
  const prep = Number(values.prepDays);
  return {
    title: values.title.trim() === '' ? 'El título es obligatorio.' : null,
    activityType: values.activityType === '' ? 'Elige un tipo de actividad.' : null,
    intervalCount:
      Number.isInteger(interval) && interval >= 1 ? null : 'Indica un número entero de 1 o más.',
    startDate: values.startDate === '' ? 'La fecha de inicio es obligatoria.' : null,
    endDate:
      values.endDate !== '' && values.startDate !== '' && values.endDate < values.startDate
        ? 'La fecha de fin no puede ser anterior a la de inicio.'
        : null,
    estimatedHours:
      Number.isFinite(hours) && hours > 0 && hours <= 999.99
        ? null
        : 'Indica el esfuerzo estimado (mayor que 0).',
    prepDays:
      values.prepDays.trim() !== '' && Number.isInteger(prep) && prep >= 0 && prep <= 365
        ? null
        : 'Indica un número entero de días entre 0 y 365.',
    responsible: responsibleOk ? null : 'Elige el responsable (una persona o un área).',
  };
}

type PreviewState =
  | { key: string; kind: 'ready'; dates: Array<{ targetDate: string; opensOn: string }> }
  | { key: string; kind: 'error' };

/**
 * Alta y edición de una DEFINICIÓN de actividad recurrente. Solo presentación y
 * validación mínima: el backend valida «exactamente un responsable», el tipo y
 * el alcance por área, y calcula la vista previa de fechas. Pausar o reanudar
 * se elige con «Estado» (solo al editar).
 */
export function DefinitionFormDialog({
  open,
  onOpenChange,
  editing,
  submitting,
  errorMessage,
  activityTypes,
  users,
  areas,
  onSubmit,
}: DefinitionFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<DefinitionFormValues>(emptyValues());
  const [errors, setErrors] = React.useState<Validation>(NO_ERRORS);
  const [summary, setSummary] = React.useState('');
  const [pendingBody, setPendingBody] = React.useState<CreateRecurringActivity | null>(null);
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  const [retry, setRetry] = React.useState(0);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const [seenKey, setSeenKey] = React.useState<string | null>(null);
  const resetKey = open ? (editing?.id ?? 'new') : null;
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    if (open) {
      setErrors(NO_ERRORS);
      setSummary('');
      setPendingBody(null);
      setPreview(null);
      if (editing) {
        setValues({
          title: editing.title,
          description: editing.description ?? '',
          activityType: editing.activityType,
          cadence: editing.cadence,
          intervalCount: String(editing.intervalCount),
          startDate: toDateInputValue(editing.startDate),
          endDate: editing.endDate ? toDateInputValue(editing.endDate) : '',
          responsibleKind: editing.responsibleKind === 'AREA' ? 'AREA' : 'USER',
          responsibleUserId: editing.responsibleUserId ?? '',
          responsibleAreaId: editing.responsibleAreaId ?? '',
          active: editing.active,
          estimatedHours: String(editing.estimatedHours),
          prepDays: String(editing.prepDays),
          prepTouched: true,
          requiresEvidence: editing.requiresEvidence,
        });
      } else {
        setValues(emptyValues());
      }
    }
  }

  // --- Vista previa de las próximas 3 fechas (debounce 400 ms) ---
  const previewQuery = React.useMemo<RecurrencePreviewQuery | null>(() => {
    const interval = Number(values.intervalCount);
    const prep = Number(values.prepDays);
    if (
      values.startDate === '' ||
      !Number.isInteger(interval) ||
      interval < 1 ||
      values.prepDays.trim() === '' ||
      !Number.isInteger(prep) ||
      prep < 0
    ) {
      return null;
    }
    return {
      cadence: values.cadence as RecurrencePreviewQuery['cadence'],
      intervalCount: interval,
      startDate: values.startDate,
      prepDays: prep,
      ...(values.endDate !== '' ? { endDate: values.endDate } : {}),
    };
  }, [values.cadence, values.intervalCount, values.startDate, values.endDate, values.prepDays]);
  const previewKey = previewQuery ? `${JSON.stringify(previewQuery)}#${retry}` : null;

  React.useEffect(() => {
    if (!open || !previewQuery || !previewKey) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewDates(previewQuery)
        .then((result) => {
          if (!cancelled) setPreview({ key: previewKey, kind: 'ready', dates: result.dates });
        })
        .catch(() => {
          if (!cancelled) setPreview({ key: previewKey, kind: 'error' });
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, previewQuery, previewKey]);

  function clear(field: keyof Validation): void {
    setErrors((p) => (p[field] ? { ...p, [field]: null } : p));
  }

  function buildBody(): CreateRecurringActivity {
    return {
      title: values.title.trim(),
      activityType: values.activityType,
      cadence: values.cadence as CreateRecurringActivity['cadence'],
      intervalCount: Number(values.intervalCount),
      startDate: values.startDate,
      responsibleKind: values.responsibleKind,
      estimatedHours: parseDecimal(values.estimatedHours),
      prepDays: Number(values.prepDays),
      requiresEvidence: values.requiresEvidence,
      ...(isEdit ? { active: values.active } : {}),
      ...(values.description.trim() !== '' ? { description: values.description.trim() } : {}),
      ...(values.endDate !== '' ? { endDate: values.endDate } : {}),
      ...(values.responsibleKind === 'USER'
        ? { responsibleUserId: values.responsibleUserId }
        : { responsibleAreaId: values.responsibleAreaId }),
    };
  }

  /** Cambios que mueven fechas: cadencia, intervalo, inicio o fin. */
  function regeneratesDates(): boolean {
    if (!editing) return false;
    return (
      values.cadence !== editing.cadence ||
      Number(values.intervalCount) !== editing.intervalCount ||
      values.startDate !== toDateInputValue(editing.startDate) ||
      values.endDate !== (editing.endDate ? toDateInputValue(editing.endDate) : '')
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = validate(values);
    setErrors(result);
    const invalid = FIELD_ORDER.filter(([key]) => result[key]);
    if (invalid.length > 0) {
      setSummary(`Hay ${invalid.length} ${invalid.length === 1 ? 'campo' : 'campos'} por corregir.`);
      document.getElementById(invalid[0][1])?.focus();
      return;
    }
    setSummary('');
    const body = buildBody();
    if (regeneratesDates()) {
      setPendingBody(body);
      return;
    }
    onSubmit(body, false);
  }

  let previewBody: React.ReactNode;
  if (!previewQuery) {
    previewBody = (
      <p className="text-sm text-muted-foreground">
        Completa la cadencia y la fecha de inicio para ver las próximas fechas.
      </p>
    );
  } else if (preview && preview.key === previewKey && preview.kind === 'error') {
    previewBody = (
      <InlineNotice
        tone="warning"
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setPreview(null);
              setRetry((n) => n + 1);
            }}
          >
            Reintentar
          </Button>
        }
      >
        No se pudo calcular la vista previa. Puedes guardar de todos modos.
      </InlineNotice>
    );
  } else if (preview && preview.kind === 'ready') {
    const stale = preview.key !== previewKey;
    previewBody =
      preview.dates.length === 0 ? (
        <InlineNotice tone="warning">Con estas fechas no habrá nuevas ocurrencias.</InlineNotice>
      ) : (
        <ul aria-busy={stale} className="grid gap-1">
          {preview.dates.map((date) => (
            <li key={date.targetDate} className="text-sm tabular-nums">
              {formatDateOnlyWithWeekday(date.targetDate)}
              <span className="text-muted-foreground">
                {' '}
                · se habilita el {formatDateOnlyWithWeekday(date.opensOn)}
              </span>
            </li>
          ))}
        </ul>
      );
  } else {
    previewBody = (
      <div aria-busy="true" className="grid gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const intervalNumber = Number(values.intervalCount) || 1;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg" onOpenAutoFocus={captureTrigger} onCloseAutoFocus={handleCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar actividad recurrente' : 'Nueva actividad recurrente'}</DialogTitle>
            <DialogDescription>
              Define qué se repite, cada cuánto y quién es responsable. El sistema programa las fechas
              automáticamente.
            </DialogDescription>
          </DialogHeader>

          <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="grid gap-4">
              <RequiredHint />
              <p className="sr-only" role="status" aria-live="polite">
                {summary}
              </p>

              <Field id="def-title" label="Título" required error={errors.title}>
                <Input
                  value={values.title}
                  placeholder="Reporte semanal a presidencia"
                  onChange={(e) => {
                    const title = e.target.value;
                    setValues((v) => ({ ...v, title }));
                    clear('title');
                  }}
                />
              </Field>

              <Field id="def-description" label="Descripción">
                <Textarea
                  value={values.description}
                  rows={3}
                  onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                />
              </Field>

              <Field id="def-type" label="Tipo de actividad" required error={errors.activityType}>
                {(control) => (
                  <Select
                    value={values.activityType}
                    onValueChange={(activityType) => {
                      setValues((v) => ({ ...v, activityType }));
                      clear('activityType');
                    }}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Elige un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {activityTypes.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <fieldset className="grid gap-1.5">
                <legend className="text-sm font-medium">
                  Se repite cada
                  <span aria-hidden="true" className="text-danger">
                    {' '}
                    *
                  </span>
                </legend>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="grid gap-1">
                    <Input
                      id="def-interval"
                      type="number"
                      min={1}
                      step={1}
                      className="w-20"
                      aria-label="Cada cuántos periodos"
                      aria-required="true"
                      aria-invalid={errors.intervalCount ? true : undefined}
                      aria-describedby={errors.intervalCount ? 'def-interval-error' : undefined}
                      value={values.intervalCount}
                      onChange={(e) => {
                        const intervalCount = e.target.value;
                        setValues((v) => ({ ...v, intervalCount }));
                        clear('intervalCount');
                      }}
                    />
                  </div>
                  <Select
                    value={values.cadence}
                    onValueChange={(cadence) =>
                      setValues((v) => ({
                        ...v,
                        cadence,
                        prepDays: v.prepTouched ? v.prepDays : defaultPrepDays(cadence),
                      }))
                    }
                  >
                    <SelectTrigger aria-label="Unidad de repetición" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {recurrenceUnit(value, intervalNumber)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="self-center text-meta text-muted-foreground">Ej.: cada 2 semanas</span>
                </div>
                {errors.intervalCount ? (
                  <p id="def-interval-error" className="text-meta text-danger">
                    {errors.intervalCount}
                  </p>
                ) : null}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="def-start" label="Fecha de inicio" required error={errors.startDate}>
                  <Input
                    type="date"
                    value={values.startDate}
                    onChange={(e) => {
                      const startDate = e.target.value;
                      setValues((v) => ({ ...v, startDate }));
                      clear('startDate');
                    }}
                  />
                </Field>
                <Field
                  id="def-end"
                  label="Fecha de fin"
                  help="Déjala vacía si no termina."
                  error={errors.endDate}
                >
                  <Input
                    type="date"
                    value={values.endDate}
                    onChange={(e) => {
                      const endDate = e.target.value;
                      setValues((v) => ({ ...v, endDate }));
                      clear('endDate');
                    }}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="def-hours"
                  label="Esfuerzo estimado (h)"
                  required
                  help="Tiempo que toma cada vez. Se usa para medir carga y cumplimiento."
                  error={errors.estimatedHours}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.25}
                    step={0.25}
                    className="w-32"
                    value={values.estimatedHours}
                    onChange={(e) => {
                      const estimatedHours = e.target.value;
                      setValues((v) => ({ ...v, estimatedHours }));
                      clear('estimatedHours');
                    }}
                  />
                </Field>
                <Field
                  id="def-prep"
                  label="Días de preparación (días antes)"
                  required
                  help="Desde cuándo puede tomarse o completarse. Antes de ese día aparece como “Programada”."
                  error={errors.prepDays}
                >
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    className="w-24"
                    value={values.prepDays}
                    onChange={(e) => {
                      const prepDays = e.target.value;
                      setValues((v) => ({ ...v, prepDays, prepTouched: true }));
                      clear('prepDays');
                    }}
                  />
                </Field>
              </div>

              <section
                aria-labelledby="def-preview-title"
                aria-live="polite"
                className="grid gap-2 rounded-lg bg-primary-subtle/60 p-3"
              >
                <h3 id="def-preview-title" className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarRange aria-hidden="true" className="size-4" />
                  Próximas fechas
                </h3>
                {previewBody}
              </section>

              <div className="grid gap-1.5">
                <span id="def-resp-label" className="text-sm font-medium">
                  Responsable
                  <span aria-hidden="true" className="text-danger">
                    {' '}
                    *
                  </span>
                </span>
                <SegmentedRadio
                  id="def-responsible-kind"
                  name="responsible-kind"
                  labelledBy="def-resp-label"
                  options={[
                    { value: 'USER', label: 'Persona' },
                    { value: 'AREA', label: 'Área' },
                  ]}
                  value={values.responsibleKind}
                  onValueChange={(kind) => {
                    setValues((v) => ({ ...v, responsibleKind: kind === 'AREA' ? 'AREA' : 'USER' }));
                    clear('responsible');
                  }}
                  className="w-fit"
                />
              </div>

              {values.responsibleKind === 'USER' ? (
                <Field id="def-user" label="Persona responsable" required error={errors.responsible}>
                  {(control) => (
                    <Select
                      value={values.responsibleUserId}
                      onValueChange={(responsibleUserId) => {
                        setValues((v) => ({ ...v, responsibleUserId }));
                        clear('responsible');
                      }}
                    >
                      <SelectTrigger {...control}>
                        <SelectValue placeholder="Elige una persona" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              ) : (
                <Field id="def-user" label="Área responsable" required error={errors.responsible}>
                  {(control) => (
                    <Select
                      value={values.responsibleAreaId}
                      onValueChange={(responsibleAreaId) => {
                        setValues((v) => ({ ...v, responsibleAreaId }));
                        clear('responsible');
                      }}
                    >
                      <SelectTrigger {...control}>
                        <SelectValue placeholder="Elige un área" />
                      </SelectTrigger>
                      <SelectContent>
                        {areas.map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            {area.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}

              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="def-evidence">Exigir al menos un adjunto al completar</Label>
                  <Switch
                    id="def-evidence"
                    aria-describedby="def-evidence-help"
                    checked={values.requiresEvidence}
                    onCheckedChange={(checked) => setValues((v) => ({ ...v, requiresEvidence: checked }))}
                  />
                </div>
                <p id="def-evidence-help" className="text-meta text-muted-foreground">
                  Quien complete deberá subir un archivo.
                </p>
              </div>

              {isEdit ? (
                <div className="grid gap-1.5">
                  <span id="def-state-label" className="text-sm font-medium">
                    Estado
                  </span>
                  <SegmentedRadio
                    id="def-state"
                    name="estado"
                    labelledBy="def-state-label"
                    describedBy="def-state-help"
                    options={[
                      { value: 'active', label: 'Activa' },
                      { value: 'paused', label: 'Pausada' },
                    ]}
                    value={values.active ? 'active' : 'paused'}
                    onValueChange={(state) => setValues((v) => ({ ...v, active: state === 'active' }))}
                    className="w-fit"
                  />
                  <p id="def-state-help" className="text-meta text-muted-foreground">
                    Si la pausas, no se programan nuevas fechas y se cancelan las pendientes que aún no empiezan.
                  </p>
                </div>
              ) : null}

              <FormError id={FORM_ID} message={errorMessage} />
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" loading={submitting}>
                {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear actividad'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingBody !== null}
        onOpenChange={(next) => {
          if (!next) setPendingBody(null);
        }}
        title="¿Guardar y regenerar las fechas?"
        description="Se cancelarán las fechas futuras que aún no se han tomado y se generarán de nuevo. Las ya tomadas o completadas no cambian."
        confirmLabel="Guardar y regenerar"
        cancelLabel="Volver"
        tone="default"
        onConfirm={() => {
          if (pendingBody) onSubmit(pendingBody, true);
        }}
      />
    </>
  );
}
