'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Field, FormError, RequiredHint, type FieldControlProps } from '@/components/field';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  ActivityClass,
  DailyLogActivity,
  Issue,
  MyWorkItem,
  Request,
} from '@/lib/api-client';

export interface ActividadFormValues {
  classificationCode: ActivityClass;
  hours: string;
  projectRequestId: string;
  taskId: string;
  assetRef: string;
  requesterRef: string;
  justification: string;
  description: string;
  result: string;
  evidenceUrl: string;
  relatedIssueId: string;
}

interface ActividadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Actividad en edición; si se pasa, el diálogo edita (PATCH). */
  editing?: DailyLogActivity | null;
  /** Solicitudes en alcance (para el «proyecto» planificado). */
  requests: Request[];
  /** Tareas asignadas al actor (para la tarea planificada). */
  tasks: MyWorkItem[];
  /** Novedades del proceso del diario (relación opcional). */
  issues: Issue[];
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: ActividadFormValues) => void;
}

export const CLASSIFICATIONS: { value: ActivityClass; label: string; hint: string }[] = [
  {
    value: 'PLANIFICADA',
    label: 'Planificada',
    hint: 'Trabajo sobre un proyecto o una tarea del plan.',
  },
  {
    value: 'SOPORTE',
    label: 'Soporte',
    hint: 'Atención sobre un activo o servicio.',
  },
  {
    value: 'INTERNA',
    label: 'Interna',
    hint: 'Trabajo interno del área (sin referencia obligatoria).',
  },
  {
    value: 'EXTRAORDINARIA',
    label: 'Extraordinaria',
    hint: 'Requiere solicitante y justificación.',
  },
];

const SIN_VALOR = '__none__';

/** Id del formulario: el FormError lleva `act-form-error`. */
const FORM_ID = 'act-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;

type FieldKey = 'hours' | 'assetRef';

interface Validation {
  fieldErrors: Partial<Record<FieldKey, string>>;
  /** Regla que combina campos (planificada; extraordinaria). */
  formError: string | null;
  /** Campos implicados en la regla combinada que la incumplen (NIT 6b). */
  combined: Partial<Record<'projectRequestId' | 'taskId' | 'requesterRef' | 'justification', true>>;
}

function emptyValues(): ActividadFormValues {
  return {
    classificationCode: 'PLANIFICADA',
    hours: '',
    projectRequestId: '',
    taskId: '',
    assetRef: '',
    requesterRef: '',
    justification: '',
    description: '',
    result: '',
    evidenceUrl: '',
    relatedIssueId: '',
  };
}

const NO_ERRORS: Validation = { fieldErrors: {}, formError: null, combined: {} };

/**
 * Reglas del cliente, las mismas de siempre, evaluadas todas a la vez (design
 * §9). Solo UX: la autoridad es el 400 del backend.
 */
function validate(values: ActividadFormValues): Validation {
  const result: Validation = { fieldErrors: {}, formError: null, combined: {} };
  const cls = values.classificationCode;
  if (cls === 'PLANIFICADA' && !values.projectRequestId && !values.taskId) {
    result.formError = 'Una actividad planificada requiere un proyecto o una tarea.';
    result.combined = { projectRequestId: true, taskId: true };
  }
  if (cls === 'SOPORTE' && !values.assetRef.trim()) {
    result.fieldErrors.assetRef = 'Una actividad de soporte requiere indicar el activo.';
  }
  if (cls === 'EXTRAORDINARIA') {
    const noRequester = !values.requesterRef.trim();
    const noJustification = !values.justification.trim();
    if (noRequester || noJustification) {
      result.formError = 'Una actividad extraordinaria requiere solicitante y justificación.';
      if (noRequester) result.combined.requesterRef = true;
      if (noJustification) result.combined.justification = true;
    }
  }
  if (values.hours.trim() !== '') {
    const h = Number(values.hours);
    if (!Number.isInteger(h) || h < 0) {
      result.fieldErrors.hours = 'Las horas deben ser un entero mayor o igual a 0.';
    }
  }
  return result;
}

/** Marca un campo implicado en la regla combinada que la incumple (NIT 6b). */
function withCombined(control: FieldControlProps, invalid: boolean | undefined): FieldControlProps {
  if (!invalid) return control;
  const describedBy = [control['aria-describedby'], FORM_ERROR_ID].filter(Boolean).join(' ');
  return { ...control, 'aria-invalid': true, 'aria-describedby': describedBy };
}

export function ActividadFormDialog({
  open,
  onOpenChange,
  editing,
  requests,
  tasks,
  issues,
  submitting,
  errorMessage,
  onSubmit,
}: ActividadFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<ActividadFormValues>(emptyValues);
  const [validation, setValidation] = React.useState<Validation>(NO_ERRORS);
  const projectRef = React.useRef<HTMLButtonElement>(null);
  const assetRef = React.useRef<HTMLInputElement>(null);
  const requesterRef = React.useRef<HTMLInputElement>(null);
  const justificationRef = React.useRef<HTMLTextAreaElement>(null);
  const hoursRef = React.useRef<HTMLInputElement>(null);

  // Inicializa al abrir. El reset solo ocurre aquí; ante fallo del POST/PATCH el
  // padre mantiene el diálogo abierto con los valores (AC-031).
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setValidation(NO_ERRORS);
    if (editing) {
      setValues({
        classificationCode: (editing.classificationCode as ActivityClass) ?? 'PLANIFICADA',
        hours: String(editing.hours ?? 0),
        projectRequestId: editing.projectRequestId ?? '',
        taskId: editing.taskId ?? '',
        assetRef: editing.assetRef ?? '',
        requesterRef: editing.requesterRef ?? '',
        justification: editing.justification ?? '',
        description: editing.description ?? '',
        result: editing.result ?? '',
        evidenceUrl: editing.evidenceUrl ?? '',
        relatedIssueId: editing.relatedIssueId ?? '',
      });
    } else {
      setValues(emptyValues());
    }
  });

  function set<K extends keyof ActividadFormValues>(key: K, value: ActividadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // El error de un campo se limpia al editarlo; el de la regla combinada,
    // al editar cualquiera de sus campos.
    setValidation((prev) => {
      if (key === 'hours' || key === 'assetRef') {
        return { ...prev, fieldErrors: { ...prev.fieldErrors, [key]: undefined } };
      }
      if (key in prev.combined) return { ...prev, formError: null, combined: {} };
      return prev;
    });
  }

  const cls = values.classificationCode;
  const { fieldErrors, combined } = validation;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = validate(values);
    setValidation(result);
    const hasErrors = Boolean(
      result.formError || result.fieldErrors.hours || result.fieldErrors.assetRef,
    );
    if (hasErrors) {
      // Foco al primer campo con error, en orden del DOM.
      if (result.combined.projectRequestId) projectRef.current?.focus();
      else if (result.fieldErrors.assetRef) assetRef.current?.focus();
      else if (result.combined.requesterRef) requesterRef.current?.focus();
      else if (result.combined.justification) justificationRef.current?.focus();
      else if (result.fieldErrors.hours) hoursRef.current?.focus();
      return;
    }
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar actividad' : 'Agregar actividad'}</DialogTitle>
          <DialogDescription>
            Los campos obligatorios cambian según la clasificación. Las horas son dedicación y no
            cambian el avance de la tarea.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-5">
            <RequiredHint />

            <div className="grid gap-4">
              <h3 className="text-sm font-semibold">Clasificación y referencia</h3>
              <Field
                id="act-class"
                label="Clasificación"
                required
                help={CLASSIFICATIONS.find((c) => c.value === cls)?.hint}
              >
                {(control) => (
                  <Select
                    value={cls}
                    onValueChange={(v) => {
                      set('classificationCode', v as ActivityClass);
                      // Cambian los campos condicionales: sus errores ya no aplican.
                      setValidation((prev) => ({
                        fieldErrors: { hours: prev.fieldErrors.hours },
                        formError: null,
                        combined: {},
                      }));
                    }}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFICATIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              {/* Campos condicionados por la clasificación (UX; la validación
                  autoritativa es el 400 del backend). */}
              {cls === 'PLANIFICADA' ? (
                <>
                  <Field id="act-project" label="Proyecto (solicitud)">
                    {(control) => (
                      <Select
                        value={values.projectRequestId || SIN_VALOR}
                        onValueChange={(v) => set('projectRequestId', v === SIN_VALOR ? '' : v)}
                      >
                        <SelectTrigger ref={projectRef} {...withCombined(control, combined.projectRequestId)}>
                          <SelectValue placeholder="Sin proyecto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SIN_VALOR}>Sin proyecto</SelectItem>
                          {requests.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                  <Field
                    id="act-task"
                    label="Tarea"
                    help="Indica un proyecto o una tarea (al menos uno)."
                  >
                    {(control) => (
                      <Select
                        value={values.taskId || SIN_VALOR}
                        onValueChange={(v) => set('taskId', v === SIN_VALOR ? '' : v)}
                      >
                        <SelectTrigger {...withCombined(control, combined.taskId)}>
                          <SelectValue placeholder="Sin tarea" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SIN_VALOR}>Sin tarea</SelectItem>
                          {tasks.map((t) => (
                            <SelectItem key={t.taskId} value={t.taskId}>
                              {t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                </>
              ) : null}

              {cls === 'SOPORTE' ? (
                <Field id="act-asset" label="Activo" required error={fieldErrors.assetRef}>
                  <Input
                    ref={assetRef}
                    value={values.assetRef}
                    placeholder="Nombre o referencia del activo"
                    onChange={(e) => set('assetRef', e.target.value)}
                  />
                </Field>
              ) : null}

              {cls === 'EXTRAORDINARIA' ? (
                <>
                  <Field id="act-requester" label="Solicitante" required>
                    {(control) => (
                      <Input
                        ref={requesterRef}
                        {...withCombined(control, combined.requesterRef)}
                        value={values.requesterRef}
                        placeholder="Quién solicitó la actividad"
                        onChange={(e) => set('requesterRef', e.target.value)}
                      />
                    )}
                  </Field>
                  <Field id="act-justification" label="Justificación" required>
                    {(control) => (
                      <Textarea
                        ref={justificationRef}
                        {...withCombined(control, combined.justification)}
                        value={values.justification}
                        placeholder="Por qué fue necesaria"
                        onChange={(e) => set('justification', e.target.value)}
                      />
                    )}
                  </Field>
                </>
              ) : null}
            </div>

            <div className="grid gap-4">
              <h3 className="text-sm font-semibold">Detalle de la actividad</h3>
              <Field
                id="act-hours"
                label="Horas (dedicación)"
                error={fieldErrors.hours}
                help="Entero mayor o igual a 0. Es dedicación del día; no cambia el avance de la tarea."
              >
                <Input
                  ref={hoursRef}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={values.hours}
                  placeholder="0"
                  onChange={(e) => set('hours', e.target.value)}
                />
              </Field>

              <Field id="act-description" label="Descripción">
                <Textarea
                  value={values.description}
                  placeholder="Qué se hizo"
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>

              <Field id="act-result" label="Resultado">
                <Textarea
                  value={values.result}
                  placeholder="Resultado o entregable (opcional)"
                  onChange={(e) => set('result', e.target.value)}
                />
              </Field>

              <Field id="act-issue" label="Novedad relacionada">
                {(control) => (
                  <Select
                    value={values.relatedIssueId || SIN_VALOR}
                    onValueChange={(v) => set('relatedIssueId', v === SIN_VALOR ? '' : v)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Sin novedad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VALOR}>Sin novedad</SelectItem>
                      {issues.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field id="act-evidence" label="Evidencia">
                <Input
                  value={values.evidenceUrl}
                  placeholder="URL o referencia (opcional)"
                  onChange={(e) => set('evidenceUrl', e.target.value)}
                />
              </Field>
            </div>

            <FormError id={FORM_ID} message={validation.formError ?? errorMessage} />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
