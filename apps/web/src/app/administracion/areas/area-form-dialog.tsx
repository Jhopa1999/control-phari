'use client';

import * as React from 'react';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { useResetOnChange } from '@/lib/use-reset-on-change';
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
import { Switch } from '@/components/ui/switch';
import type { Area } from '@/lib/api-client';

export interface AreaFormValues {
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

interface AreaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si se pasa, el dialogo esta en modo edicion (codigo de solo lectura). */
  editing?: Area | null;
  submitting: boolean;
  /** Error del backend (p. ej. el 409 de code duplicado); el padre lo limpia al abrir. */
  errorMessage: string | null;
  onSubmit: (values: AreaFormValues) => void;
}

const FORM_ID = 'area-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;

const EMPTY: AreaFormValues = { code: '', name: '', active: true, sortOrder: 0 };

interface Validation {
  codeError: string | null;
  nameError: string | null;
}

const NO_ERRORS: Validation = { codeError: null, nameError: null };

/** Reglas minimas en cliente; el backend es la autoridad. */
function validate(values: AreaFormValues, isEdit: boolean): Validation {
  return {
    codeError: !isEdit && values.code.trim() === '' ? 'El código es obligatorio.' : null,
    nameError: values.name.trim() === '' ? 'El nombre es obligatorio.' : null,
  };
}

/**
 * Alta y edicion de un area (p. ej. Analitica), dialogo sm. Al editar, el
 * codigo queda en solo lectura (es estable) y el padre envia solo nombre,
 * activo y orden.
 */
export function AreaFormDialog({
  open,
  onOpenChange,
  editing,
  submitting,
  errorMessage,
  onSubmit,
}: AreaFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<AreaFormValues>(EMPTY);
  const [errors, setErrors] = React.useState<Validation>(NO_ERRORS);
  const codeRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Al abrir (o cambiar de registro) se reinician los campos y los errores.
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setErrors(NO_ERRORS);
    if (editing) {
      setValues({
        code: editing.code,
        name: editing.name,
        active: editing.active,
        sortOrder: editing.sortOrder,
      });
    } else {
      setValues(EMPTY);
    }
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = validate(values, isEdit);
    setErrors(result);
    if (result.codeError || result.nameError) {
      if (result.codeError) codeRef.current?.focus();
      else nameRef.current?.focus();
      return;
    }
    onSubmit({
      code: values.code.trim(),
      name: values.name.trim(),
      active: values.active,
      sortOrder: Number.isFinite(values.sortOrder) ? values.sortOrder : 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar área' : 'Nueva área'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'El código no se puede modificar.'
              : 'Crea un área organizativa que agrupa procesos.'}
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            {!isEdit ? <RequiredHint /> : null}

            <Field id="area-code" label="Código" required={!isEdit} error={errors.codeError}>
              <Input
                ref={codeRef}
                value={values.code}
                readOnly={isEdit}
                disabled={isEdit}
                placeholder="ANALITICA"
                aria-invalid={errors.codeError ? true : undefined}
                aria-describedby={errors.codeError ? FORM_ERROR_ID : undefined}
                onChange={(e) => {
                  const code = e.target.value;
                  setValues((v) => ({ ...v, code }));
                  setErrors((prev) => (prev.codeError ? { ...prev, codeError: null } : prev));
                }}
              />
            </Field>

            <Field id="area-name" label="Nombre" required error={errors.nameError}>
              <Input
                ref={nameRef}
                value={values.name}
                placeholder="Analitica"
                onChange={(e) => {
                  const name = e.target.value;
                  setValues((v) => ({ ...v, name }));
                  setErrors((prev) => (prev.nameError ? { ...prev, nameError: null } : prev));
                }}
              />
            </Field>

            <Field id="area-sort-order" label="Orden">
              <Input
                type="number"
                min={0}
                className="w-32"
                value={String(values.sortOrder)}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    sortOrder: Number.parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
            </Field>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="area-active">Activa</Label>
              <Switch
                id="area-active"
                checked={values.active}
                onCheckedChange={(checked) => setValues((v) => ({ ...v, active: checked }))}
              />
            </div>

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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
