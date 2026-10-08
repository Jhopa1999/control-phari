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

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  /** Devuelve true si la creacion fue exitosa (el formulario se limpia). */
  onSubmit: (input: { identifier: string; name: string }) => Promise<boolean>;
}

const EMPTY = { identifier: '', name: '' };

export function CreateUserDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit,
}: CreateUserDialogProps): React.ReactElement {
  const [values, setValues] = React.useState(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const identifierRef = React.useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const identifier = values.identifier.trim();
    const name = values.name.trim();
    if (!identifier || !name) {
      // AC-031: no se limpia; se marca el error y se conserva lo ingresado.
      setError('Identificador y nombre son obligatorios.');
      identifierRef.current?.focus();
      return;
    }
    setError(null);
    const ok = await onSubmit({ identifier, name });
    if (ok) {
      // Reset solo en exito.
      setValues(EMPTY);
    } else {
      // AC-031: en error se conservan los valores y se mantiene el foco.
      identifierRef.current?.focus();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Al cerrar manualmente se limpia; al reabrir parte de cero.
        if (!next) {
          setValues(EMPTY);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Registra una identidad funcional del area.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="user-identifier">Identificador</Label>
            <Input
              id="user-identifier"
              ref={identifierRef}
              value={values.identifier}
              placeholder="persona@demo.local"
              autoComplete="off"
              onChange={(e) =>
                setValues((v) => ({ ...v, identifier: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="user-name">Nombre</Label>
            <Input
              id="user-name"
              value={values.name}
              placeholder="Persona Demo"
              onChange={(e) =>
                setValues((v) => ({ ...v, name: e.target.value }))
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
              {submitting ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
