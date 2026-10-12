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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  Asset,
  CatalogItem,
  CoordinationPerson,
  Process,
  Request,
} from '@/lib/api-client';

export interface ActivoFormValues {
  processId: string;
  name: string;
  requestId: string;
  ownerUserId: string;
  typeCode: string;
  technologyCode: string;
  sourceCode: string;
  frequencyCode: string;
  documentationRef: string;
  functionalDescription: string;
  dependencies: string;
}

/** Valor «sin selección» para los Selects opcionales. */
const NONE = '__none__';
/** Id del formulario: el FormError lleva `activo-form-error`. */
const FORM_ID = 'activo-form';

type FieldKey = 'processId' | 'name';
type FieldErrors = Partial<Record<FieldKey, string>>;

interface ActivoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Activo en edición; si se pasa, el diálogo edita (PATCH). */
  editing?: Asset | null;
  processes: Process[];
  requests: Request[];
  owners: CoordinationPerson[];
  typeOptions: CatalogItem[];
  technologyOptions: CatalogItem[];
  sourceOptions: CatalogItem[];
  frequencyOptions: CatalogItem[];
  submitting: boolean;
  /** Error del backend en línea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: ActivoFormValues) => void;
}

const EMPTY: ActivoFormValues = {
  processId: '',
  name: '',
  requestId: '',
  ownerUserId: '',
  typeCode: '',
  technologyCode: '',
  sourceCode: '',
  frequencyCode: '',
  documentationRef: '',
  functionalDescription: '',
  dependencies: '',
};

/** Reglas del cliente (las de siempre), evaluadas todas a la vez (design §9). */
function validate(values: ActivoFormValues, isEdit: boolean): FieldErrors {
  const errors: FieldErrors = {};
  // El proceso es inmutable al editar (el backend no lo acepta en PATCH).
  if (!isEdit && !values.processId) errors.processId = 'El proceso es obligatorio.';
  if (values.name.trim() === '') errors.name = 'El nombre del activo es obligatorio.';
  return errors;
}

/**
 * Alta y edición de un activo (design §11.16), diálogo md. El activo nace en
 * Borrador; el estado se cambia desde la tabla. Ante un fallo el diálogo queda
 * abierto con los valores.
 */
export function ActivoFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  requests,
  owners,
  typeOptions,
  technologyOptions,
  sourceOptions,
  frequencyOptions,
  submitting,
  errorMessage,
  onSubmit,
}: ActivoFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<ActivoFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const processRef = React.useRef<HTMLButtonElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  // Sin DialogTrigger, Radix no sabe a dónde devolver el foco al cerrar: vuelve
  // al botón que abrió el diálogo («Nuevo activo» o «Editar»), NIT 4.
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Inicializa al abrir. El reset solo ocurre aquí (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setValues({
        processId: editing.processId,
        name: editing.name,
        requestId: editing.requestId ?? '',
        ownerUserId: editing.ownerUserId ?? '',
        typeCode: editing.typeCode ?? '',
        technologyCode: editing.technologyCode ?? '',
        sourceCode: editing.sourceCode ?? '',
        frequencyCode: editing.frequencyCode ?? '',
        documentationRef: editing.documentationRef ?? '',
        functionalDescription: editing.functionalDescription ?? '',
        dependencies: editing.dependencies ?? '',
      });
    } else {
      setValues(EMPTY);
    }
  }, [open, editing]);

  const activeProcesses = React.useMemo(() => processes.filter((p) => p.active), [processes]);

  function set<K extends keyof ActivoFormValues>(key: K, value: ActivoFormValues[K]): void {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((prev) => (key in prev ? { ...prev, [key]: undefined } : prev));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const errors = validate(values, isEdit);
    setFieldErrors(errors);
    if (errors.processId || errors.name) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.processId) processRef.current?.focus();
      else nameRef.current?.focus();
      return;
    }
    onSubmit(values);
  }

  function optionalSelect(
    id: string,
    label: string,
    placeholder: string,
    value: string,
    options: CatalogItem[],
    onChange: (code: string) => void,
  ): React.ReactElement {
    return (
      <Field id={id} label={label}>
        {(control) => (
          <Select
            value={value === '' ? NONE : value}
            onValueChange={(v) => onChange(v === NONE ? '' : v)}
          >
            <SelectTrigger {...control}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{placeholder}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.code}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={(event) => {
          // Registra el disparador y lleva el foco inicial al nombre, como hasta ahora.
          captureTrigger();
          event.preventDefault();
          nameRef.current?.focus();
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar activo' : 'Nuevo activo'}</DialogTitle>
          <DialogDescription>
            Un activo nace en estado Borrador y pertenece a un proceso. Su estado se cambia
            desde la tabla.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />

            <Field
              id="activo-process"
              label="Proceso"
              required={!isEdit}
              error={fieldErrors.processId}
              help={isEdit ? 'El proceso de un activo no se puede cambiar.' : undefined}
            >
              {(control) =>
                isEdit ? (
                  <Input
                    {...control}
                    readOnly
                    disabled
                    value={processes.find((p) => p.id === values.processId)?.name ?? values.processId}
                  />
                ) : (
                  <Select value={values.processId} onValueChange={(v) => set('processId', v)}>
                    <SelectTrigger ref={processRef} {...control}>
                      <SelectValue placeholder="Selecciona un proceso" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProcesses.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            </Field>

            <Field id="activo-name" label="Nombre" required error={fieldErrors.name}>
              <Input
                ref={nameRef}
                value={values.name}
                placeholder="Tablero de indicadores comerciales"
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              {optionalSelect('activo-type', 'Tipo', 'Sin tipo', values.typeCode, typeOptions, (v) =>
                set('typeCode', v),
              )}
              {optionalSelect(
                'activo-technology',
                'Tecnología',
                'Sin tecnología',
                values.technologyCode,
                technologyOptions,
                (v) => set('technologyCode', v),
              )}
              {optionalSelect(
                'activo-source',
                'Fuente',
                'Sin fuente',
                values.sourceCode,
                sourceOptions,
                (v) => set('sourceCode', v),
              )}
              {optionalSelect(
                'activo-frequency',
                'Frecuencia',
                'Sin frecuencia',
                values.frequencyCode,
                frequencyOptions,
                (v) => set('frequencyCode', v),
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="activo-request" label="Solicitud de origen">
                {(control) => (
                  <Select
                    value={values.requestId === '' ? NONE : values.requestId}
                    onValueChange={(v) => set('requestId', v === NONE ? '' : v)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Sin solicitud" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin solicitud</SelectItem>
                      {requests.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              {/* Etiqueta exacta «Responsable» y única en el diálogo (responsible-selector.spec.ts). */}
              <Field id="activo-owner" label="Responsable">
                {(control) => (
                  <Select
                    value={values.ownerUserId === '' ? NONE : values.ownerUserId}
                    onValueChange={(v) => set('ownerUserId', v === NONE ? '' : v)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Sin responsable" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin responsable</SelectItem>
                      {owners.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <Field id="activo-doc-ref" label="Referencia documental">
              <Input
                value={values.documentationRef}
                placeholder="Repositorio, ruta o enlace (opcional)"
                onChange={(e) => set('documentationRef', e.target.value)}
              />
            </Field>

            <Field id="activo-functional" label="Descripción funcional">
              <Textarea
                value={values.functionalDescription}
                placeholder="Qué resuelve este activo (opcional)"
                onChange={(e) => set('functionalDescription', e.target.value)}
              />
            </Field>

            <Field id="activo-dependencies" label="Dependencias">
              <Textarea
                value={values.dependencies}
                placeholder="Dependencias u observaciones (opcional)"
                onChange={(e) => set('dependencies', e.target.value)}
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear activo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
