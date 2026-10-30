'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
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
import type {
  Asset,
  CoordinationPerson,
  Process,
  Request,
} from '@/lib/api-client';

export interface ActivoFormValues {
  processId: string;
  name: string;
  requestId: string;
  ownerUserId: string;
  documentationRef: string;
  generalDescription: string;
  dependencies: string;
  /** Procesos que pueden ver/usar el activo (sin incluir al propietario). */
  visibleProcessIds: string[];
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
  documentationRef: '',
  generalDescription: '',
  dependencies: '',
  visibleProcessIds: [],
};

/** Reglas del cliente (las de siempre), evaluadas todas a la vez (design §9). */
function validate(values: ActivoFormValues, isEdit: boolean): FieldErrors {
  const errors: FieldErrors = {};
  // El proceso propietario es inmutable al editar (el backend no lo acepta en PATCH).
  if (!isEdit && !values.processId) errors.processId = 'El proceso es obligatorio.';
  if (values.name.trim() === '') errors.name = 'El nombre del activo es obligatorio.';
  return errors;
}

/**
 * Alta y edición de un activo genérico (design §11.16/§f), diálogo md. El activo
 * nace en Borrador; el estado se cambia desde la tabla. El jefe define qué
 * procesos pueden ver/usar el activo (el propietario siempre es visible, se
 * muestra marcado y deshabilitado). Ante un fallo el diálogo queda abierto con
 * los valores.
 */
export function ActivoFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  requests,
  owners,
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
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setFieldErrors({});
    if (editing) {
      setValues({
        processId: editing.processId,
        name: editing.name,
        requestId: editing.requestId ?? '',
        ownerUserId: editing.ownerUserId ?? '',
        documentationRef: editing.documentationRef ?? '',
        generalDescription: editing.generalDescription ?? '',
        dependencies: editing.dependencies ?? '',
        visibleProcessIds: editing.visibleProcessIds ?? [],
      });
    } else {
      setValues(EMPTY);
    }
  });

  const activeProcesses = React.useMemo(() => processes.filter((p) => p.active), [processes]);

  // Procesos elegibles para la visibilidad: activos distintos del propietario.
  // El propietario se pinta aparte (marcado + deshabilitado).
  const ownerProcessId = values.processId;
  const visibilityOptions = React.useMemo(
    () => activeProcesses.filter((p) => p.id !== ownerProcessId),
    [activeProcesses, ownerProcessId],
  );
  const ownerProcessName = React.useMemo(
    () => processes.find((p) => p.id === ownerProcessId)?.name ?? null,
    [processes, ownerProcessId],
  );

  function set<K extends keyof ActivoFormValues>(key: K, value: ActivoFormValues[K]): void {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((prev) => (key in prev ? { ...prev, [key]: undefined } : prev));
  }

  function toggleVisible(processId: string, checked: boolean): void {
    setValues((v) => {
      const current = new Set(v.visibleProcessIds);
      if (checked) current.add(processId);
      else current.delete(processId);
      return { ...v, visibleProcessIds: Array.from(current) };
    });
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
    // Nunca reenviar el propietario dentro de visibleProcessIds.
    onSubmit({
      ...values,
      visibleProcessIds: values.visibleProcessIds.filter((id) => id !== ownerProcessId),
    });
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
            Un activo nace en estado Borrador y pertenece a un proceso. El jefe de área define
            qué procesos pueden verlo. Su estado se cambia desde la tabla.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />

            <Field
              id="activo-process"
              label="Proceso propietario"
              required={!isEdit}
              error={fieldErrors.processId}
              help={isEdit ? 'El proceso propietario de un activo no se puede cambiar.' : undefined}
            >
              {(control) =>
                isEdit ? (
                  <Input
                    {...control}
                    readOnly
                    disabled
                    value={
                      processes.find((p) => p.id === values.processId)?.name ??
                      'Proceso fuera de tu alcance'
                    }
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

            <Field
              id="activo-visibility"
              label="Procesos que pueden ver el activo"
              help="El proceso propietario siempre puede verlo. Marca los procesos adicionales."
            >
              {() => (
                <div
                  id="activo-visibility"
                  role="group"
                  aria-label="Procesos que pueden ver el activo"
                  className="grid gap-1 rounded-md border p-3"
                >
                  {ownerProcessName ? (
                    <label className="flex min-h-8 items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked disabled aria-label={`${ownerProcessName} (propietario)`} />
                      <span>
                        {ownerProcessName} <span className="text-xs">(propietario)</span>
                      </span>
                    </label>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Selecciona primero el proceso propietario.
                    </p>
                  )}
                  {visibilityOptions.map((p) => (
                    <label
                      key={p.id}
                      className="flex min-h-8 cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={values.visibleProcessIds.includes(p.id)}
                        onChange={(e) => toggleVisible(p.id, e.target.checked)}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </Field>

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

            <Field id="activo-general" label="Descripción general">
              <Textarea
                value={values.generalDescription}
                placeholder="De qué se trata este activo (opcional)"
                onChange={(e) => set('generalDescription', e.target.value)}
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
