'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
import { CODE_HELP, normalizeCodeInput, validateCode } from '@/lib/code-format';
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
import type { Area, Process } from '@/lib/api-client';

export interface ProcessFormValues {
  code: string;
  name: string;
  areaId: string;
  framework: string;
  active: boolean;
  sortOrder: number;
}

interface ProcesoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si se pasa, el dialogo esta en modo edicion (codigo y area de solo lectura). */
  editing?: Process | null;
  /** Todas las areas, para resolver el nombre del area en edicion. */
  areas: Area[];
  /** Areas activas para el selector obligatorio (solo al crear). */
  activeAreas: Area[];
  submitting: boolean;
  /** Error del backend que no es de un campo; el padre lo limpia al abrir. */
  errorMessage: string | null;
  /** Error del servidor para el campo «Código» (formato o duplicado). */
  codeServerError?: string | null;
  /** El usuario editó el código: el padre borra `codeServerError`. */
  onCodeEdited?: () => void;
  onSubmit: (values: ProcessFormValues) => void;
}

const FORM_ID = 'proceso-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;

const EMPTY: ProcessFormValues = {
  code: '',
  name: '',
  areaId: '',
  framework: '',
  active: true,
  sortOrder: 0,
};

interface Validation {
  codeError: string | null;
  nameError: string | null;
  areaError: string | null;
}

const NO_ERRORS: Validation = { codeError: null, nameError: null, areaError: null };

/** Reglas minimas en cliente; el backend es la autoridad. */
function validate(values: ProcessFormValues, isEdit: boolean): Validation {
  return {
    codeError: isEdit ? null : validateCode(values.code),
    nameError: values.name.trim() === '' ? 'El nombre es obligatorio.' : null,
    areaError: !isEdit && values.areaId === '' ? 'El área es obligatoria.' : null,
  };
}

/**
 * Alta y edicion de un proceso (por ejemplo, BI), dialogo sm. Al crear, el area
 * es un selector OBLIGATORIO de areas activas. Al editar, codigo y area quedan
 * en solo lectura (el proceso no se mueve de area desde aqui) y el padre envia
 * solo nombre, marco, activo y orden.
 */
export function ProcesoFormDialog({
  open,
  onOpenChange,
  editing,
  areas,
  activeAreas,
  submitting,
  errorMessage,
  codeServerError = null,
  onCodeEdited,
  onSubmit,
}: ProcesoFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<ProcessFormValues>(EMPTY);
  const [errors, setErrors] = React.useState<Validation>(NO_ERRORS);
  const codeRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();
  const codeFieldError = errors.codeError ?? codeServerError;

  // Con un error del servidor en el código, el foco va a ese campo.
  React.useEffect(() => {
    if (open && codeServerError) codeRef.current?.focus();
  }, [open, codeServerError]);

  // Nombre del area del proceso en edicion, solo para mostrarla (no se mueve).
  const editingAreaName = React.useMemo(() => {
    if (!editing) return '';
    const area = areas.find((a) => a.id === editing.areaId);
    return area ? `${area.name} (${area.code})` : editing.areaId;
  }, [editing, areas]);

  useResetOnChange([open, editing], () => {
    if (!open) return;
    setErrors(NO_ERRORS);
    if (editing) {
      setValues({
        code: editing.code,
        name: editing.name,
        areaId: editing.areaId,
        framework: editing.framework ?? '',
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
    if (result.codeError || result.nameError || result.areaError) {
      if (result.codeError) codeRef.current?.focus();
      else if (result.nameError) nameRef.current?.focus();
      else document.getElementById('proceso-area')?.focus();
      return;
    }
    onSubmit({
      code: normalizeCodeInput(values.code),
      name: values.name.trim(),
      areaId: values.areaId,
      framework: values.framework.trim(),
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
          <DialogTitle>{isEdit ? 'Editar proceso' : 'Nuevo proceso'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'El código y el área no se pueden modificar.'
              : 'Crea un proceso dentro de un área (por ejemplo, BI).'}
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            {!isEdit ? <RequiredHint /> : null}

            <Field
              id="proceso-code"
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
                placeholder="p. ej. FIBI"
                onChange={(e) => {
                  const code = e.target.value;
                  setValues((v) => ({ ...v, code }));
                  setErrors((prev) => (prev.codeError ? { ...prev, codeError: null } : prev));
                  onCodeEdited?.();
                }}
              />
            </Field>

            <Field id="proceso-name" label="Nombre" required error={errors.nameError}>
              <Input
                ref={nameRef}
                value={values.name}
                placeholder="p. ej. Inteligencia de negocio"
                onChange={(e) => {
                  const name = e.target.value;
                  setValues((v) => ({ ...v, name }));
                  setErrors((prev) => (prev.nameError ? { ...prev, nameError: null } : prev));
                }}
              />
            </Field>

            <Field id="proceso-area" label="Área" required={!isEdit} error={errors.areaError}>
              {(control) =>
                isEdit ? (
                  <Input {...control} value={editingAreaName} readOnly disabled />
                ) : (
                  <Select
                    value={values.areaId}
                    onValueChange={(value) => {
                      setValues((v) => ({ ...v, areaId: value }));
                      setErrors((prev) => (prev.areaError ? { ...prev, areaError: null } : prev));
                    }}
                  >
                    <SelectTrigger
                      {...control}
                      aria-invalid={errors.areaError ? true : undefined}
                      aria-describedby={errors.areaError ? FORM_ERROR_ID : undefined}
                    >
                      <SelectValue placeholder="Elige un área" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAreas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.name} ({area.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>

            <Field id="proceso-framework" label="Marco" help="Opcional.">
              <Input
                value={values.framework}
                placeholder="p. ej. INS-006"
                onChange={(e) => setValues((v) => ({ ...v, framework: e.target.value }))}
              />
            </Field>

            <Field id="proceso-sort-order" label="Orden">
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
              <Label htmlFor="proceso-active">Activo</Label>
              <Switch
                id="proceso-active"
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
