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
import { Textarea } from '@/components/ui/textarea';
import type { CatalogItem } from '@/lib/api-client';
import {
  CODE_HELP,
  normalizeCodeInput,
  validateCatalogName,
  validateCode,
} from '@/lib/code-format';

export interface CatalogFormValues {
  catalog: string;
  code: string;
  label: string;
  description: string;
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
  /** Errores del servidor que marcan «Catálogo» o «Código» (formato o duplicado). */
  serverErrors?: { catalog: string | null; code: string | null };
  /** El usuario editó uno de los dos campos: el padre borra su error del servidor. */
  onFieldEdited?: (field: 'catalog' | 'code') => void;
  onSubmit: (values: CatalogFormValues) => void;
}

/** Id del formulario: el FormError lleva `catalog-form-error`. */
const FORM_ID = 'catalog-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;

const EMPTY: CatalogFormValues = {
  catalog: '',
  code: '',
  label: '',
  description: '',
  active: true,
  sortOrder: 0,
};

interface Validation {
  /** Regla de dos campos: «Catálogo y código son obligatorios.». */
  formError: string | null;
  /** Campos de la regla combinada que la incumplen (NIT 6b). */
  missing: { catalog: boolean; code: boolean };
  labelError: string | null;
  /** Formato o longitud de cada campo (los vacíos van en la regla combinada). */
  catalogFormat: string | null;
  codeFormat: string | null;
}

const NO_ERRORS: Validation = {
  formError: null,
  missing: { catalog: false, code: false },
  labelError: null,
  catalogFormat: null,
  codeFormat: null,
};

/** Reglas del cliente (las de siempre), evaluadas todas a la vez (design §9). */
function validate(values: CatalogFormValues, isEdit: boolean): Validation {
  const missingCatalog = !isEdit && values.catalog.trim() === '';
  const missingCode = !isEdit && values.code.trim() === '';
  return {
    formError: missingCatalog || missingCode ? 'Catálogo y código son obligatorios.' : null,
    missing: { catalog: missingCatalog, code: missingCode },
    labelError: values.label.trim() === '' ? 'La etiqueta es obligatoria.' : null,
    catalogFormat: isEdit || missingCatalog ? null : validateCatalogName(values.catalog),
    codeFormat: isEdit || missingCode ? null : validateCode(values.code),
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
  serverErrors = { catalog: null, code: null },
  onFieldEdited,
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
        description: editing.description ?? '',
        active: editing.active,
        sortOrder: editing.sortOrder,
      });
    } else {
      setValues(EMPTY);
    }
  });

  function updatePair(key: 'catalog' | 'code', value: string): void {
    setValues((v) => ({ ...v, [key]: value }));
    onFieldEdited?.(key);
    // El error de un campo se limpia al editarlo; la regla combinada, cuando
    // ningún campo implicado queda marcado.
    setErrors((prev) => {
      const formatKey = key === 'catalog' ? 'catalogFormat' : 'codeFormat';
      if (!prev.missing[key] && !prev[formatKey]) return prev;
      const missing = { ...prev.missing, [key]: false };
      return {
        ...prev,
        missing,
        [formatKey]: null,
        formError: missing.catalog || missing.code ? prev.formError : null,
      };
    });
  }

  const catalogFieldError = errors.catalogFormat ?? serverErrors.catalog;
  const codeFieldError = errors.codeFormat ?? serverErrors.code;

  // Con un error del servidor en un campo, el foco va al primero (en orden del DOM).
  React.useEffect(() => {
    if (!open) return;
    if (serverErrors.catalog) catalogRef.current?.focus();
    else if (serverErrors.code) codeRef.current?.focus();
  }, [open, serverErrors.catalog, serverErrors.code]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // Validación mínima en cliente; el backend es la autoridad.
    const result = validate(values, isEdit);
    setErrors(result);
    if (result.formError || result.labelError || result.catalogFormat || result.codeFormat) {
      // Foco al primer campo con error, en orden del DOM.
      if (result.missing.catalog || result.catalogFormat) catalogRef.current?.focus();
      else if (result.missing.code || result.codeFormat) codeRef.current?.focus();
      else labelRef.current?.focus();
      return;
    }
    onSubmit({
      catalog: normalizeCodeInput(values.catalog),
      code: normalizeCodeInput(values.code),
      label: values.label.trim(),
      description: values.description.trim(),
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

            <Field
              id="catalog"
              label="Catálogo"
              required={!isEdit}
              help={isEdit ? undefined : CODE_HELP}
              error={catalogFieldError}
            >
              <Input
                ref={catalogRef}
                className="font-mono uppercase placeholder:normal-case placeholder:text-muted-foreground"
                value={values.catalog}
                readOnly={isEdit}
                disabled={isEdit}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                placeholder="p. ej. FASE_PROYECTO"
                aria-invalid={errors.missing.catalog ? true : undefined}
                aria-describedby={errors.missing.catalog ? FORM_ERROR_ID : undefined}
                onChange={(e) => updatePair('catalog', e.target.value)}
              />
            </Field>

            <Field
              id="code"
              label="Código"
              required={!isEdit}
              help={isEdit ? undefined : CODE_HELP}
              error={codeFieldError}
            >
              <Input
                ref={codeRef}
                className="font-mono uppercase placeholder:normal-case placeholder:text-muted-foreground"
                value={values.code}
                readOnly={isEdit}
                disabled={isEdit}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                placeholder="p. ej. TIPO_SOLICITUD"
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

            <Field
              id="description"
              label="Descripción"
              help="Opcional. Explica qué significa y cuándo elegirla; se muestra bajo la opción en los desplegables."
            >
              <Textarea
                rows={3}
                maxLength={500}
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
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
