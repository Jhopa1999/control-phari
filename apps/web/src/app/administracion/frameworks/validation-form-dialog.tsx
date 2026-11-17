'use client';

import * as React from 'react';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { CatalogItem, CoordinationPerson } from '@/lib/api-client';
import type { CreateValidation } from '@/lib/governance';

const FORM_ID = 'validation-form';
interface ValidationFormValues {
  validationTypeCode: string;
  testCase: string;
  version: string;
  environment: string;
  resultCode: string;
  blocking: boolean;
  /** Id de la persona elegida o ''. */
  executorChoice: string;
  executedAt: string;
  evidenceRef: string;
  notes: string;
}

const EMPTY: ValidationFormValues = {
  validationTypeCode: '',
  testCase: '',
  version: '',
  environment: '',
  resultCode: '',
  blocking: false,
  executorChoice: '',
  executedAt: '',
  evidenceRef: '',
  notes: '',
};

type FieldKey = 'type' | 'testCase' | 'result' | 'executor' | 'executedAt';
type FieldErrors = Partial<Record<FieldKey, string>>;

export interface ValidationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  typeCatalog: CatalogItem[];
  resultCatalog: CatalogItem[];
  /** Personas en alcance; vacía si no hay o si la lista no se pudo cargar. */
  people: CoordinationPerson[];
  /** Líder o jefe: pueden registrar a nombre de cualquier persona del alcance. */
  canReview: boolean;
  /** Persona actual: el integrante solo puede registrar validaciones ejecutadas por sí mismo. */
  actorUserId: string | null;
  actorName: string | null;
  submitting: boolean;
  /** Error del backend, en línea; los valores escritos se conservan. */
  errorMessage: string | null;
  onSubmit: (input: CreateValidation) => void;
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Registrar una validación (design §11.18), diálogo md. Mismos campos e ids que
 * el formulario anterior; el ejecutor se elige entre las personas en alcance
 * (valor = id de usuario, el mismo executedByUserId) o se escribe a mano. Las
 * cinco reglas del cliente se muestran a la vez, cada una en su campo (NIT 6a).
 */
export function ValidationFormDialog({
  open,
  onOpenChange,
  typeCatalog,
  resultCatalog,
  people,
  canReview,
  actorUserId,
  actorName,
  submitting,
  errorMessage,
  onSubmit,
}: ValidationFormDialogProps): React.ReactElement {
  const [values, setValues] = React.useState<ValidationFormValues>(EMPTY);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [wasOpen, setWasOpen] = React.useState(open);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Quien gestiona elige entre las personas del alcance; el integrante solo se tiene a sí mismo (D11).
  const options = React.useMemo<Array<{ id: string; name: string }>>(() => {
    if (canReview) {
      const list = people.map((person) => ({ id: person.id, name: person.name }));
      if (actorUserId && !list.some((p) => p.id === actorUserId)) {
        list.unshift({ id: actorUserId, name: actorName ?? 'Yo' });
      }
      return list;
    }
    return actorUserId ? [{ id: actorUserId, name: actorName ?? 'Yo' }] : [];
  }, [canReview, people, actorUserId, actorName]);
  const ownOnly = !canReview;
  // La fecha de ejecución no puede ser posterior a ahora (hora local del navegador).
  const maxExecutedAt = React.useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se recalcula cada vez que se abre el diálogo.
  }, [open]);

  // Cada apertura empieza vacía; ante un error del backend el diálogo sigue
  // abierto y conserva lo escrito (el reinicio solo ocurre tras el éxito).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues({ ...EMPTY, executorChoice: !canReview && actorUserId ? actorUserId : '' });
      setErrors({});
    }
  }

  function update<K extends keyof ValidationFormValues>(
    key: K,
    value: ValidationFormValues[K],
    clears?: FieldKey,
  ): void {
    setValues((v) => ({ ...v, [key]: value }));
    if (clears) setErrors((prev) => (prev[clears] ? { ...prev, [clears]: undefined } : prev));
  }

  function executorId(): string {
    return values.executorChoice;
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!values.validationTypeCode) next.type = 'Elige el tipo de validación.';
    if (!values.testCase.trim()) next.testCase = 'Escribe el caso de prueba.';
    if (!values.resultCode) next.result = 'Elige el resultado.';
    if (!executorId()) next.executor = 'Indica quién ejecutó la validación.';
    if (!values.executedAt) next.executedAt = 'Indica la fecha y hora de ejecución.';
    else if (values.executedAt > maxExecutedAt) {
      next.executedAt = 'La fecha de ejecución no puede ser posterior a hoy.';
    }
    return next;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting) return;
    const next = validate();
    setErrors(next);
    // Foco al primer campo con error, en orden del DOM.
    const order: Array<[FieldKey, string]> = [
      ['type', 'val-type'],
      ['result', 'val-result'],
      ['testCase', 'val-case'],
      ['executor', 'val-executor'],
      ['executedAt', 'val-executed-at'],
    ];
    const first = order.find(([key]) => next[key]);
    if (first) {
      document.getElementById(first[1])?.focus();
      return;
    }
    onSubmit({
      validationTypeCode: values.validationTypeCode,
      testCase: values.testCase.trim(),
      version: trimOrUndefined(values.version),
      environment: trimOrUndefined(values.environment),
      resultCode: values.resultCode,
      blocking: values.blocking,
      executedByUserId: executorId(),
      executedAt: new Date(values.executedAt).toISOString(),
      evidenceRef: trimOrUndefined(values.evidenceRef),
      notes: trimOrUndefined(values.notes),
    });
  }

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Registrar validación</DialogTitle>
          <DialogDescription>
            Registrar una validación no aprueba ningún control. GC4 se bloquea si hay un defecto
            bloqueante sin resolver.
          </DialogDescription>
        </DialogHeader>
        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="val-type" label="Tipo" required error={errors.type}>
                {(control) => (
                  <Select
                    value={values.validationTypeCode}
                    onValueChange={(v) => update('validationTypeCode', v, 'type')}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Elige un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {typeCatalog.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field id="val-result" label="Resultado" required error={errors.result}>
                {(control) => (
                  <Select value={values.resultCode} onValueChange={(v) => update('resultCode', v, 'result')}>
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Elige un resultado" />
                    </SelectTrigger>
                    <SelectContent>
                      {resultCatalog.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <Field id="val-case" label="Caso de prueba" required error={errors.testCase}>
              <Input
                value={values.testCase}
                onChange={(e) => update('testCase', e.target.value, 'testCase')}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="val-version" label="Versión de la solución">
                <Input value={values.version} onChange={(e) => update('version', e.target.value)} />
              </Field>
              <Field id="val-env" label="Ambiente">
                <Input value={values.environment} onChange={(e) => update('environment', e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-4">
                <Field
                  id="val-executor"
                  label="Ejecutor"
                  required
                  error={errors.executor}
                  help={ownOnly ? 'Solo puedes registrar validaciones ejecutadas por ti.' : undefined}
                >
                  {(control) => (
                    <Select
                      value={values.executorChoice}
                      disabled={ownOnly}
                      onValueChange={(v) => update('executorChoice', v, 'executor')}
                    >
                      <SelectTrigger {...control}>
                        <SelectValue placeholder="Elige una persona" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              </div>
              <Field id="val-executed-at" label="Fecha de ejecución" required error={errors.executedAt}>
                <Input
                  type="datetime-local"
                  max={maxExecutedAt}
                  value={values.executedAt}
                  onChange={(e) => update('executedAt', e.target.value, 'executedAt')}
                />
              </Field>
            </div>

            <Field id="val-evidence" label="Evidencia (URL o nota)">
              <Input value={values.evidenceRef} onChange={(e) => update('evidenceRef', e.target.value)} />
            </Field>

            <Field id="val-notes" label="Notas">
              <Textarea value={values.notes} onChange={(e) => update('notes', e.target.value)} />
            </Field>

            <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={values.blocking}
                onChange={(e) => update('blocking', e.target.checked)}
              />
              Defecto bloqueante
            </label>

            <FormError id={FORM_ID} message={errorMessage} />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Registrando…' : 'Registrar validación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
