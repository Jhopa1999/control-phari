'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { AreaFormDialog, type AreaFormValues } from '@/app/administracion/areas/area-form-dialog';
import { useActor } from '@/lib/actor-context';
import { ApiError, createArea } from '@/lib/areas';
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
  const { allowedModules } = useActor();
  const canCreateArea = allowedModules.has('areas');
  // Áreas creadas desde este diálogo (el padre aún no las conoce).
  const [createdAreas, setCreatedAreas] = React.useState<Area[]>([]);
  const [areaDialogOpen, setAreaDialogOpen] = React.useState(false);
  const [areaSubmitting, setAreaSubmitting] = React.useState(false);
  const [areaCreateError, setAreaCreateError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [areaId, setAreaId] = React.useState('');
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [areaError, setAreaError] = React.useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  useResetOnChange([open, editing], () => {
    if (!open) return;
    setNameError(null);
    setAreaError(null);
    setName(editing?.name ?? '');
    setAreaId(editing?.areaId ?? '');
  });

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
    const known = [...areas, ...createdAreas.filter((c) => !areas.some((a) => a.id === c.id))];
    if (editing && !known.some((a) => a.id === editing.areaId)) {
      return [
        ...known,
        { id: editing.areaId, name: `${editing.areaName} (inactiva)` } as Area,
      ];
    }
    return known;
  }, [areas, createdAreas, editing]);

  async function handleCreateArea(v: AreaFormValues): Promise<void> {
    setAreaSubmitting(true);
    setAreaCreateError(null);
    try {
      const created = await createArea({ code: v.code, name: v.name, sortOrder: v.sortOrder });
      setCreatedAreas((prev) => [...prev, created]);
      setAreaId(created.id);
      setAreaCreateError(null);
      setAreaDialogOpen(false);
      toast.success(`Área «${created.name}» creada y seleccionada.`);
    } catch (err) {
      setAreaCreateError(err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setAreaSubmitting(false);
    }
  }

  return (
    <>
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

            <Field
              id="requester-area"
              label="Área"
              required
              error={areaError}
              help={
                canCreateArea ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-meta"
                    onClick={() => {
                      setAreaCreateError(null);
                      setAreaDialogOpen(true);
                    }}
                  >
                    <Plus aria-hidden="true" />
                    ¿No está el área? Crear área
                  </Button>
                ) : (
                  '¿No está el área? Pídele al administrador que la cree en Administración → Áreas.'
                )
              }
            >
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
    {canCreateArea ? (
      <AreaFormDialog
        open={areaDialogOpen}
        onOpenChange={setAreaDialogOpen}
        submitting={areaSubmitting}
        errorMessage={areaCreateError}
        onSubmit={(v) => void handleCreateArea(v)}
      />
    ) : null}
    </>
  );
}
