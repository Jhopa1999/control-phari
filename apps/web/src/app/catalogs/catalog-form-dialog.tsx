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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { CatalogItem } from '@/lib/api-client';

export interface CatalogFormValues {
  catalog: string;
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

interface CatalogFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si se pasa, el diálogo está en modo edición (catálogo y código solo lectura). */
  editing?: CatalogItem | null;
  submitting: boolean;
  /** Error del backend (p. ej. el 409 de duplicado); el padre lo limpia al abrir. */
  errorMessage: string | null;
  onSubmit: (values: CatalogFormValues) => void;
}

/** Id del formulario: el FormError lleva `catalog-form-error`. */
const FORM_ID = 'catalog-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;

const EMPTY: CatalogFormValues = {
  catalog: '',
  code: '',
  label: '',
  active: true,
  sortOrder: 0,
};

interface Validation {
  /** Regla de dos campos: «Catálogo y código son obligatorios.». */
  formError: string | null;
  /** Campos de la regla combinada que la incumplen (NIT 6b). */
  missing: { catalog: boolean; code: boolean };
  labelError: string | null;
}

const NO_ERRORS: Validation = {
  formError: null,
  missing: { catalog: false, code: false },
  labelError: null,
};

/** Reglas del cliente (las de siempre), evaluadas todas a la vez (design §9). */
function validate(values: CatalogFormValues, isEdit: boolean): Validation {
  const missingCatalog = !isEdit && values.catalog.trim() === '';
  const missingCode = !isEdit && values.code.trim() === '';
  return {
    formError: missingCatalog || missingCode ? 'Catálogo y código son obligatorios.' : null,
    missing: { catalog: missingCatalog, code: missingCode },
    labelError: values.label.trim() === '' ? 'La etiqueta es obligatoria.' : null,
  };
}

/**
 * Alta y edición de un elemento de maestra (design §11.22), diálogo sm. Al
 * editar, catálogo y código quedan en solo lectura y el padre envía solo
 * etiqueta, activo y orden. Textos fijados por E2E: design §13.4.
 */
export function CatalogFormDialog({
  open,
  onOpenChange,
  editing,
  submitting,
  errorMessage,
  onSubmit,
}: CatalogFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<CatalogFormValues>(EMPTY);
  const [errors, setErrors] = React.useState<Validation>(NO_ERRORS);
  const catalogRef = React.useRef<HTMLInputElement>(null);
  const codeRef = React.useRef<HTMLInputElement>(null);
  const labelRef = React.useRef<HTMLInputElement>(null);
  // Sin DialogTrigger, el foco vuelve al botón que abrió el diálogo (NIT 4).
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Reinicia el formulario cada vez que se abre (crear o editar).
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setErrors(NO_ERRORS);
    if (editing) {
      setValues({
        catalog: editing.catalog,
        code: editing.code,
        label: editing.label,
        active: editing.active,
        sortOrder: editing.sortOrder,
      });
    } else {
      setValues(EMPTY);
    }
  });

  function updatePair(key: 'catalog' | 'code', value: string): void {
    setValues((v) => ({ ...v, [key]: value }));
    // El error de un campo se limpia al editarlo; la regla combinada, cuando
    // ningún campo implicado queda marcado.
    setErrors((prev) => {
      if (!prev.missing[key]) return prev;
      const missing = { ...prev.missing, [key]: false };
      return {
        ...prev,
        missing,
        formError: missing.catalog || missing.code ? prev.formError : null,
      };
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // Validación mínima en cliente; el backend es la autoridad.
    const result = validate(values, isEdit);
    setErrors(result);
    if (result.formError || result.labelError) {
      // Foco al primer campo con error, en orden del DOM.
      if (result.missing.catalog) catalogRef.current?.focus();
      else if (result.missing.code) codeRef.current?.focus();
      else labelRef.current?.focus();
      return;
    }
    onSubmit({
      catalog: values.catalog.trim(),
      code: values.code.trim(),
      label: values.label.trim(),
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
          <DialogTitle>{isEdit ? 'Editar elemento' : 'Nuevo elemento'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'El catálogo y el código no se pueden modificar.'
              : 'Crea un valor reutilizable para una maestra del portal.'}
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            {!isEdit ? <RequiredHint /> : null}

            <Field id="catalog" label="Catálogo" required={!isEdit}>
              <Input
                ref={catalogRef}
                value={values.catalog}
                readOnly={isEdit}
                disabled={isEdit}
                placeholder="PRIORITY"
                aria-invalid={errors.missing.catalog ? true : undefined}
                aria-describedby={errors.missing.catalog ? FORM_ERROR_ID : undefined}
                onChange={(e) => updatePair('catalog', e.target.value)}
              />
            </Field>

            <Field id="code" label="Código" required={!isEdit}>
              <Input
                ref={codeRef}
                value={values.code}
                readOnly={isEdit}
                disabled={isEdit}
                placeholder="HIGH"
                aria-invalid={errors.missing.code ? true : undefined}
                aria-describedby={errors.missing.code ? FORM_ERROR_ID : undefined}
                onChange={(e) => updatePair('code', e.target.value)}
              />
            </Field>

            <Field id="label" label="Etiqueta" required error={errors.labelError}>
              <Input
                ref={labelRef}
                value={values.label}
                placeholder="Alta"
                onChange={(e) => {
                  const label = e.target.value;
                  setValues((v) => ({ ...v, label }));
                  setErrors((prev) => (prev.labelError ? { ...prev, labelError: null } : prev));
                }}
              />
            </Field>

            <Field id="sortOrder" label="Orden">
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
              <Label htmlFor="active">Activo</Label>
              <Switch
                id="active"
                checked={values.active}
                onCheckedChange={(checked) => setValues((v) => ({ ...v, active: checked }))}
              />
            </div>

            {/* Regla combinada o, si no la hay, el error del backend (los dos van en FormError). */}
            <FormError id={FORM_ID} message={errors.formError ?? errorMessage} />
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
