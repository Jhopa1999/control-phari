'use client';

import * as React from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  Area,
  CatalogItem,
  CreateRecurringActivity,
  RecurringActivity,
  User,
} from '@/lib/api-client';
import { localDateInputValue } from '@/lib/format';
import { RECURRENCES, recurrenceLabel } from '@/lib/status-labels';

/**
 * Convierte el valor de fecha del contrato (un @db.Date serializado a
 * medianoche UTC, p. ej. "2024-01-10T00:00:00.000Z") al valor YYYY-MM-DD que
 * espera <input type="date">. Se lee por la terna UTC para no correr el día.
 */
function toDateInputValue(iso: string): string {
  // Los @db.Date llegan como ISO con hora 00:00:00Z: la porción de fecha es su
  // día de calendario, así que basta con tomar los primeros 10 caracteres.
  return iso.slice(0, 10);
}

export interface DefinitionFormValues {
  title: string;
  description: string;
  activityType: string;
  cadence: string;
  intervalCount: number;
  startDate: string;
  endDate: string;
  responsibleKind: 'USER' | 'AREA';
  responsibleUserId: string;
  responsibleAreaId: string;
  active: boolean;
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
  onSubmit: (values: CreateRecurringActivity) => void;
}

const FORM_ID = 'recurring-def-form';

function emptyValues(): DefinitionFormValues {
  return {
    title: '',
    description: '',
    activityType: '',
    cadence: 'MENSUAL',
    intervalCount: 1,
    startDate: localDateInputValue(new Date()),
    endDate: '',
    responsibleKind: 'USER',
    responsibleUserId: '',
    responsibleAreaId: '',
    active: true,
  };
}

interface Validation {
  title: string | null;
  activityType: string | null;
  startDate: string | null;
  responsible: string | null;
}

const NO_ERRORS: Validation = {
  title: null,
  activityType: null,
  startDate: null,
  responsible: null,
};

/** Reglas minimas en cliente; el backend es la autoridad. */
function validate(values: DefinitionFormValues): Validation {
  const responsibleOk =
    values.responsibleKind === 'USER'
      ? values.responsibleUserId !== ''
      : values.responsibleAreaId !== '';
  return {
    title: values.title.trim() === '' ? 'El título es obligatorio.' : null,
    activityType: values.activityType === '' ? 'Elige un tipo de actividad.' : null,
    startDate: values.startDate === '' ? 'La fecha de inicio es obligatoria.' : null,
    responsible: responsibleOk
      ? null
      : 'Elige el responsable (una persona o un área).',
  };
}

/**
 * Alta y edición de una DEFINICIÓN de actividad recurrente (FEAT-002). Solo
 * presentación y validación mínima: el backend valida "exactamente un
 * responsable", el tipo de actividad del catálogo y el alcance por área. El
 * estado (pausar) se gestiona con el switch «Activa» y el botón Pausar de la
 * lista.
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
  const titleRef = React.useRef<HTMLInputElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  React.useEffect(() => {
    if (!open) return;
    setErrors(NO_ERRORS);
    if (editing) {
      setValues({
        title: editing.title,
        description: editing.description ?? '',
        activityType: editing.activityType,
        cadence: editing.cadence,
        intervalCount: editing.intervalCount,
        startDate: toDateInputValue(editing.startDate),
        endDate: editing.endDate ? toDateInputValue(editing.endDate) : '',
        responsibleKind: editing.responsibleKind === 'AREA' ? 'AREA' : 'USER',
        responsibleUserId: editing.responsibleUserId ?? '',
        responsibleAreaId: editing.responsibleAreaId ?? '',
        active: editing.active,
      });
    } else {
      setValues(emptyValues());
    }
  }, [open, editing]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = validate(values);
    setErrors(result);
    if (result.title || result.activityType || result.startDate || result.responsible) {
      if (result.title) titleRef.current?.focus();
      return;
    }
    const body: CreateRecurringActivity = {
      title: values.title.trim(),
      activityType: values.activityType,
      cadence: values.cadence as CreateRecurringActivity['cadence'],
      intervalCount: values.intervalCount,
      startDate: values.startDate,
      responsibleKind: values.responsibleKind,
      active: values.active,
      ...(values.description.trim() !== '' ? { description: values.description.trim() } : {}),
      ...(values.endDate !== '' ? { endDate: values.endDate } : {}),
      ...(values.responsibleKind === 'USER'
        ? { responsibleUserId: values.responsibleUserId }
        : { responsibleAreaId: values.responsibleAreaId }),
    };
    onSubmit(body);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar actividad recurrente' : 'Nueva actividad recurrente'}
          </DialogTitle>
          <DialogDescription>
            Define qué se repite, cada cuánto y quién es responsable. El sistema
            genera las ocurrencias automáticamente.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />

            <Field id="def-title" label="Título" required error={errors.title}>
              <Input
                ref={titleRef}
                value={values.title}
                placeholder="Reporte semanal a presidencia"
                onChange={(e) => {
                  const title = e.target.value;
                  setValues((v) => ({ ...v, title }));
                  setErrors((p) => (p.title ? { ...p, title: null } : p));
                }}
              />
            </Field>

            <Field id="def-description" label="Descripción">
              <Textarea
                value={values.description}
                rows={2}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="def-type" label="Tipo de actividad" required error={errors.activityType}>
                {(control) => (
                  <Select
                    value={values.activityType}
                    onValueChange={(activityType) => {
                      setValues((v) => ({ ...v, activityType }));
                      setErrors((p) => (p.activityType ? { ...p, activityType: null } : p));
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

              <Field id="def-cadence" label="Cadencia" required>
                {(control) => (
                  <Select
                    value={values.cadence}
                    onValueChange={(cadence) => setValues((v) => ({ ...v, cadence }))}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {recurrenceLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="def-interval"
                label="Cada"
                help="Número de periodos entre ocurrencias."
              >
                <Input
                  type="number"
                  min={1}
                  value={String(values.intervalCount)}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      intervalCount: Number.parseInt(e.target.value, 10) || 1,
                    }))
                  }
                />
              </Field>

              <Field id="def-start" label="Inicio" required error={errors.startDate}>
                <Input
                  type="date"
                  value={values.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value;
                    setValues((v) => ({ ...v, startDate }));
                    setErrors((p) => (p.startDate ? { ...p, startDate: null } : p));
                  }}
                />
              </Field>

              <Field id="def-end" label="Fin (opcional)">
                <Input
                  type="date"
                  value={values.endDate}
                  onChange={(e) => setValues((v) => ({ ...v, endDate: e.target.value }))}
                />
              </Field>
            </div>

            <Field id="def-responsible-kind" label="Tipo de responsable" required>
              {(control) => (
                <Select
                  value={values.responsibleKind}
                  onValueChange={(kind) =>
                    setValues((v) => ({
                      ...v,
                      responsibleKind: kind === 'AREA' ? 'AREA' : 'USER',
                    }))
                  }
                >
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Persona</SelectItem>
                    <SelectItem value="AREA">Área</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            {values.responsibleKind === 'USER' ? (
              <Field id="def-user" label="Persona responsable" required error={errors.responsible}>
                {(control) => (
                  <Select
                    value={values.responsibleUserId}
                    onValueChange={(responsibleUserId) => {
                      setValues((v) => ({ ...v, responsibleUserId }));
                      setErrors((p) => (p.responsible ? { ...p, responsible: null } : p));
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
              <Field id="def-area" label="Área responsable" required error={errors.responsible}>
                {(control) => (
                  <Select
                    value={values.responsibleAreaId}
                    onValueChange={(responsibleAreaId) => {
                      setValues((v) => ({ ...v, responsibleAreaId }));
                      setErrors((p) => (p.responsible ? { ...p, responsible: null } : p));
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

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="def-active">Activa (genera ocurrencias)</Label>
              <Switch
                id="def-active"
                checked={values.active}
                onCheckedChange={(checked) => setValues((v) => ({ ...v, active: checked }))}
              />
            </div>

            <FormError id={FORM_ID} message={errorMessage} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
