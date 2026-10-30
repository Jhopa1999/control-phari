'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
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
  CoordinationPerson,
  Issue,
  IssueType,
  Process,
} from '@/lib/api-client';
import { localDateInputValue } from '@/lib/format';

export interface NovedadFormValues {
  processId: string;
  date: string;
  typeCode: IssueType;
  title: string;
  detail: string;
  impact: string;
  resolverUserId: string;
  targetDate: string;
  resolution: string;
}

interface NovedadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Novedad en edición; un registro por incidente (PATCH, AC-019). */
  editing?: Issue | null;
  processes: Process[];
  people: CoordinationPerson[];
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: NovedadFormValues) => void;
}

type IssueTypeValue = NonNullable<IssueType>;

export const ISSUE_TYPES: { value: IssueTypeValue; label: string }[] = [
  { value: 'BLOQUEO', label: 'Bloqueo' },
  { value: 'INCIDENTE', label: 'Incidente' },
  { value: 'CALIDAD_DATOS', label: 'Calidad de datos' },
  { value: 'SOLICITUD_APOYO', label: 'Solicitud de apoyo' },
];

const SIN_VALOR = '__none__';

type FieldKey = 'processId' | 'date' | 'title';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Id del formulario: el FormError lleva `nov-form-error`. */
const FORM_ID = 'nov-form';

/**
 * Reglas del cliente, las mismas de siempre (proceso y fecha al crear, título),
 * evaluadas todas a la vez (design §9).
 */
function validate(
  values: Pick<NovedadFormValues, 'processId' | 'date' | 'title'>,
  isEdit: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!isEdit && !values.processId) errors.processId = 'Selecciona un proceso.';
  if (!isEdit && !values.date) errors.date = 'La fecha es obligatoria.';
  if (!values.title.trim()) errors.title = 'El título es obligatorio.';
  return errors;
}

export function NovedadFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  people,
  submitting,
  errorMessage,
  onSubmit,
}: NovedadFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [date, setDate] = React.useState('');
  const [typeCode, setTypeCode] = React.useState<IssueTypeValue>('BLOQUEO');
  const [title, setTitle] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const [impact, setImpact] = React.useState('');
  const [resolverUserId, setResolverUserId] = React.useState('');
  const [targetDate, setTargetDate] = React.useState('');
  const [resolution, setResolution] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const processRef = React.useRef<HTMLButtonElement>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  // Sin DialogTrigger, Radix no sabe a dónde devolver el foco al cerrar: vuelve
  // al botón que abrió el diálogo («Nueva novedad» o «Editar»), NIT 4.
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Inicializa al abrir. El reset solo ocurre aquí; ante fallo del POST/PATCH
  // el padre mantiene el diálogo abierto con los valores (AC-031).
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setProcessId(editing.processId);
      setDate(editing.date);
      setTypeCode((editing.typeCode as IssueTypeValue) ?? 'BLOQUEO');
      setTitle(editing.title);
      setDetail(editing.detail ?? '');
      setImpact(editing.impact ?? '');
      setResolverUserId(editing.resolverUserId ?? '');
      setTargetDate(editing.targetDate ?? '');
      setResolution(editing.resolution ?? '');
    } else {
      setProcessId('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setDate(localDateInputValue());
      setTypeCode('BLOQUEO');
      setTitle('');
      setDetail('');
      setImpact('');
      setResolverUserId('');
      setTargetDate('');
      setResolution('');
    }
  });

  function clearError(key: FieldKey) {
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate({ processId, date, title }, isEdit);
    setFieldErrors(errors);
    if (errors.processId || errors.date || errors.title) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.processId) processRef.current?.focus();
      else if (errors.date) dateRef.current?.focus();
      else titleRef.current?.focus();
      return;
    }
    onSubmit({
      processId,
      date,
      typeCode,
      title,
      detail,
      impact,
      resolverUserId,
      targetDate,
      resolution,
    });
  }

  // Sin códigos internos visibles (design §13.1).
  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? 'Proceso fuera de tu alcance';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar novedad' : 'Nueva novedad'}</DialogTitle>
          <DialogDescription>
            Cada incidente es un solo registro que se actualiza hasta resolverlo. El tipo por
            defecto es Bloqueo.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="nov-process" label="Proceso" required={!isEdit} error={fieldErrors.processId}>
              {(control) =>
                isEdit ? (
                  <Input {...control} readOnly disabled value={processName(processId)} />
                ) : (
                  <Select
                    value={processId}
                    onValueChange={(value) => {
                      setProcessId(value);
                      clearError('processId');
                    }}
                  >
                    <SelectTrigger ref={processRef} {...control}>
                      <SelectValue placeholder="Selecciona un proceso" />
                    </SelectTrigger>
                    <SelectContent>
                      {processes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="nov-date" label="Fecha" required={!isEdit} error={fieldErrors.date}>
                <Input
                  ref={dateRef}
                  type="date"
                  value={date}
                  readOnly={isEdit}
                  disabled={isEdit}
                  onChange={(e) => {
                    setDate(e.target.value);
                    clearError('date');
                  }}
                />
              </Field>
              <Field id="nov-type" label="Tipo">
                {(control) => (
                  <Select
                    value={typeCode}
                    onValueChange={(v) => setTypeCode(v as IssueTypeValue)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <Field id="nov-title" label="Título" required error={fieldErrors.title}>
              <Input
                ref={titleRef}
                value={title}
                placeholder="Resumen del incidente"
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearError('title');
                }}
              />
            </Field>

            <Field id="nov-detail" label="Detalle">
              <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} />
            </Field>

            <Field id="nov-impact" label="Impacto">
              <Textarea value={impact} onChange={(e) => setImpact(e.target.value)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="nov-resolver" label="Responsable">
                {(control) => (
                  <Select
                    value={resolverUserId || SIN_VALOR}
                    onValueChange={(v) => setResolverUserId(v === SIN_VALOR ? '' : v)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VALOR}>Sin asignar</SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field id="nov-target" label="Fecha objetivo">
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </Field>
            </div>

            <Field id="nov-resolution" label="Resolución">
              <Textarea
                value={resolution}
                placeholder="Cómo se resolvió (al cerrar)"
                onChange={(e) => setResolution(e.target.value)}
              />
            </Field>

            <FormError id={FORM_ID} message={errorMessage} />
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear novedad'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
