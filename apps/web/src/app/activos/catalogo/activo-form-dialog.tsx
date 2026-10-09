'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
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
import { Textarea } from '@/components/ui/textarea';
import type {
  Asset,
  CatalogItem,
  Process,
  Request,
  User,
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

/** Valor "sin seleccion" para los Selects opcionales. */
const NONE = '__none__';

interface ActivoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Activo en edicion; si se pasa, el dialog edita (PATCH). */
  editing?: Asset | null;
  processes: Process[];
  requests: Request[];
  owners: User[];
  typeOptions: CatalogItem[];
  technologyOptions: CatalogItem[];
  sourceOptions: CatalogItem[];
  frequencyOptions: CatalogItem[];
  submitting: boolean;
  /** Mensaje de error en linea; se conserva ante fallo (AC-031). */
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
  const [clientError, setClientError] = React.useState<string | null>(null);

  // Inicializa al abrir. El reset solo ocurre aqui (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
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

  const activeProcesses = React.useMemo(
    () => processes.filter((p) => p.active),
    [processes],
  );

  function set<K extends keyof ActivoFormValues>(
    key: K,
    value: ActivoFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // El proceso es inmutable al editar (el backend no lo acepta en PATCH).
    if (!isEdit && !values.processId) {
      setClientError('El proceso es obligatorio.');
      return;
    }
    if (values.name.trim() === '') {
      setClientError('El nombre del activo es obligatorio.');
      return;
    }
    setClientError(null);
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
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={value === '' ? NONE : value}
          onValueChange={(v) => onChange(v === NONE ? '' : v)}
        >
          <SelectTrigger id={id}>
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
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar activo' : 'Nuevo activo'}</DialogTitle>
          <DialogDescription>
            Un activo nace en estado BORRADOR y pertenece a un proceso. El
            cambio de estado se hace desde la tabla, no desde este formulario.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="activo-process">Proceso *</Label>
            {isEdit ? (
              <Input
                id="activo-process"
                readOnly
                disabled
                value={
                  processes.find((p) => p.id === values.processId)?.name ??
                  values.processId
                }
              />
            ) : (
              <Select
                value={values.processId}
                onValueChange={(v) => set('processId', v)}
              >
                <SelectTrigger id="activo-process">
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
            )}
            {isEdit ? (
              <p className="text-xs text-muted-foreground">
                El proceso de un activo no se puede cambiar.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="activo-name">Nombre *</Label>
            <Input
              id="activo-name"
              value={values.name}
              autoFocus
              placeholder="Tablero de indicadores comerciales"
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {optionalSelect(
              'activo-type',
              'Tipo',
              'Sin tipo',
              values.typeCode,
              typeOptions,
              (v) => set('typeCode', v),
            )}
            {optionalSelect(
              'activo-technology',
              'Tecnologia',
              'Sin tecnologia',
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
            <div className="grid gap-2">
              <Label htmlFor="activo-request">Solicitud de origen</Label>
              <Select
                value={values.requestId === '' ? NONE : values.requestId}
                onValueChange={(v) =>
                  set('requestId', v === NONE ? '' : v)
                }
              >
                <SelectTrigger id="activo-request">
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
            </div>

            <div className="grid gap-2">
              <Label htmlFor="activo-owner">Responsable</Label>
              <Select
                value={values.ownerUserId === '' ? NONE : values.ownerUserId}
                onValueChange={(v) =>
                  set('ownerUserId', v === NONE ? '' : v)
                }
              >
                <SelectTrigger id="activo-owner">
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
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="activo-doc-ref">Referencia documental</Label>
            <Input
              id="activo-doc-ref"
              value={values.documentationRef}
              placeholder="Repositorio, ruta o enlace (opcional)."
              onChange={(e) => set('documentationRef', e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="activo-functional">Descripcion funcional</Label>
            <Textarea
              id="activo-functional"
              value={values.functionalDescription}
              placeholder="Que resuelve este activo (opcional)."
              onChange={(e) => set('functionalDescription', e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="activo-dependencies">Dependencias</Label>
            <Textarea
              id="activo-dependencies"
              value={values.dependencies}
              placeholder="Dependencias u observaciones (opcional)."
              onChange={(e) => set('dependencies', e.target.value)}
            />
          </div>

          {clientError || errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {clientError ?? errorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Guardando...'
                : isEdit
                  ? 'Guardar cambios'
                  : 'Crear activo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
