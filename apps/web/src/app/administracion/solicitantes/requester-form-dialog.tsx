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
import type { Area, Requester } from '@/lib/api-client';

export interface RequesterFormValues {
  name: string;
  areaId: string;
}

interface RequesterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Requester | null;
  /** Áreas activas del maestro de áreas. */
  areas: Area[];
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: RequesterFormValues) => void;
}

const FORM_ID = 'requester-form';

/** Alta y edición de un solicitante: el área es obligatoria. */
export function RequesterFormDialog({
  open,
  onOpenChange,
  editing,
  areas,
  submitting,
  errorMessage,
  onSubmit,
}: RequesterFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [name, setName] = React.useState('');
  const [areaId, setAreaId] = React.useState('');
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [areaError, setAreaError] = React.useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  React.useEffect(() => {
    if (!open) return;
    setNameError(null);
    setAreaError(null);
    setName(editing?.name ?? '');
    setAreaId(editing?.areaId ?? '');
  }, [open, editing]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nErr = name.trim() === '' ? 'El nombre es obligatorio.' : null;
    const aErr = areaId === '' ? 'Selecciona el área del solicitante.' : null;
    setNameError(nErr);
    setAreaError(aErr);
    if (nErr) {
      nameRef.current?.focus();
      return;
    }
    if (aErr) return;
    onSubmit({ name: name.trim(), areaId });
  }

  // Si el área actual del solicitante quedó inactiva, se mantiene visible.
  const options = React.useMemo(() => {
    if (editing && !areas.some((a) => a.id === editing.areaId)) {
      return [
        ...areas,
        { id: editing.areaId, name: `${editing.areaName} (inactiva)` } as Area,
      ];
    }
    return areas;
  }, [areas, editing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar solicitante' : 'Nuevo solicitante'}</DialogTitle>
          <DialogDescription>
            El área del solicitante se asigna automáticamente a sus solicitudes.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="requester-name" label="Nombre" required error={nameError}>
              <Input
                ref={nameRef}
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
            </Field>

            <Field id="requester-area" label="Área" required error={areaError}>
              {(control) => (
                <Select
                  value={areaId}
                  onValueChange={(v) => {
                    setAreaId(v);
                    setAreaError(null);
                  }}
                >
                  <SelectTrigger {...control}>
                    <SelectValue placeholder="Selecciona un área" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
