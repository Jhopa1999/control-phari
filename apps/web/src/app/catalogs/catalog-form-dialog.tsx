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
  /** Si se pasa, el dialog esta en modo edicion (catalog y code solo lectura). */
  editing?: CatalogItem | null;
  submitting: boolean;
  onSubmit: (values: CatalogFormValues) => void;
}

const EMPTY: CatalogFormValues = {
  catalog: '',
  code: '',
  label: '',
  active: true,
  sortOrder: 0,
};

export function CatalogFormDialog({
  open,
  onOpenChange,
  editing,
  submitting,
  onSubmit,
}: CatalogFormDialogProps) {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<CatalogFormValues>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);

  // Reinicia el formulario cada vez que se abre (crear o editar).
  React.useEffect(() => {
    if (!open) return;
    setError(null);
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
  }, [open, editing]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Validacion minima en cliente; el backend es la autoridad.
    const catalog = values.catalog.trim();
    const code = values.code.trim();
    const label = values.label.trim();
    if (!isEdit && (!catalog || !code)) {
      setError('Catalogo y codigo son obligatorios.');
      return;
    }
    if (!label) {
      setError('La etiqueta es obligatoria.');
      return;
    }
    setError(null);
    onSubmit({
      catalog,
      code,
      label,
      active: values.active,
      sortOrder: Number.isFinite(values.sortOrder) ? values.sortOrder : 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar elemento' : 'Nuevo elemento'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Catalogo y codigo son estables y no se pueden modificar.'
              : 'Crea un valor reutilizable para una maestra del portal.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="catalog">Catalogo</Label>
            <Input
              id="catalog"
              value={values.catalog}
              readOnly={isEdit}
              disabled={isEdit}
              placeholder="PRIORITY"
              onChange={(e) =>
                setValues((v) => ({ ...v, catalog: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="code">Codigo</Label>
            <Input
              id="code"
              value={values.code}
              readOnly={isEdit}
              disabled={isEdit}
              placeholder="HIGH"
              onChange={(e) =>
                setValues((v) => ({ ...v, code: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="label">Etiqueta</Label>
            <Input
              id="label"
              value={values.label}
              placeholder="Alta"
              onChange={(e) =>
                setValues((v) => ({ ...v, label: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sortOrder">Orden</Label>
            <Input
              id="sortOrder"
              type="number"
              min={0}
              value={String(values.sortOrder)}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  sortOrder: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="active">Activo</Label>
            <Switch
              id="active"
              checked={values.active}
              onCheckedChange={(checked) =>
                setValues((v) => ({ ...v, active: checked }))
              }
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
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
              {submitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
