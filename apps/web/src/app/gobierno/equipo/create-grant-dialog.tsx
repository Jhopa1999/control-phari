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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Process, User } from '@/lib/api-client';

type RoleCode = 'JEFE_AREA' | 'LIDER_PROCESO' | 'INTEGRANTE';

interface GrantFormValues {
  userId: string;
  roleCode: RoleCode | '';
  processId: string;
}

interface CreateGrantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  users: User[];
  processes: Process[];
  roleLabels: Record<string, string>;
  /** Devuelve true si la asignacion fue exitosa (el formulario se limpia). */
  onSubmit: (input: {
    userId: string;
    roleCode: RoleCode;
    processId: string;
  }) => Promise<boolean>;
}

const ROLE_CODES: RoleCode[] = ['JEFE_AREA', 'LIDER_PROCESO', 'INTEGRANTE'];

const EMPTY: GrantFormValues = { userId: '', roleCode: '', processId: '' };

export function CreateGrantDialog({
  open,
  onOpenChange,
  submitting,
  users,
  processes,
  roleLabels,
  onSubmit,
}: CreateGrantDialogProps): React.ReactElement {
  const [values, setValues] = React.useState<GrantFormValues>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.userId || !values.roleCode || !values.processId) {
      // AC-031: no se limpia; se conserva la seleccion.
      setError('Usuario, rol y proceso son obligatorios.');
      return;
    }
    setError(null);
    const ok = await onSubmit({
      userId: values.userId,
      roleCode: values.roleCode,
      processId: values.processId,
    });
    if (ok) {
      // Reset solo en exito.
      setValues(EMPTY);
    }
    // En error se conservan los valores seleccionados (AC-031).
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setValues(EMPTY);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar grant</DialogTitle>
          <DialogDescription>
            Concede un rol a un usuario dentro de un proceso.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="grant-user">Usuario</Label>
            <Select
              value={values.userId}
              onValueChange={(value) =>
                setValues((v) => ({ ...v, userId: value }))
              }
            >
              <SelectTrigger id="grant-user">
                <SelectValue placeholder="Selecciona un usuario" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.identifier})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="grant-role">Rol</Label>
            <Select
              value={values.roleCode}
              onValueChange={(value) =>
                setValues((v) => ({ ...v, roleCode: value as RoleCode }))
              }
            >
              <SelectTrigger id="grant-role">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {roleLabels[code] ?? code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="grant-process">Proceso</Label>
            <Select
              value={values.processId}
              onValueChange={(value) =>
                setValues((v) => ({ ...v, processId: value }))
              }
            >
              <SelectTrigger id="grant-process">
                <SelectValue placeholder="Selecciona un proceso" />
              </SelectTrigger>
              <SelectContent>
                {processes.map((process) => (
                  <SelectItem key={process.id} value={process.id}>
                    {process.name} ({process.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {submitting ? 'Asignando...' : 'Asignar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
