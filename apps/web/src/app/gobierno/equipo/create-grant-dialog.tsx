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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Process, User } from '@/lib/api-client';
import type { AssignableRoleCode } from '@/lib/role-hierarchy';

type RoleCode = AssignableRoleCode;
type FieldKey = 'userId' | 'roleCode' | 'processId';

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
  roleLabels: Record<RoleCode, string>;
  /**
   * Roles que el actor puede asignar, derivados de roleCodes de
   * /me/permissions (jerarquia estricta). Solo estos aparecen en el selector;
   * el backend sigue siendo la autoridad (POST /grants responde 403).
   */
  assignableRoles: readonly RoleCode[];
  /** Error del backend (p. ej. rol ya asignado); el padre lo limpia al abrir. */
  errorMessage: string | null;
  /** Devuelve true si la asignación fue exitosa (el formulario se limpia). */
  onSubmit: (input: { userId: string; roleCode: RoleCode; processId: string }) => Promise<boolean>;
}

const FORM_ID = 'grant-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;
const EMPTY: GrantFormValues = { userId: '', roleCode: '', processId: '' };
const NO_MISSING: Record<FieldKey, boolean> = { userId: false, roleCode: false, processId: false };
const FIELD_ORDER: readonly FieldKey[] = ['userId', 'roleCode', 'processId'];
const FIELD_IDS: Record<FieldKey, string> = {
  userId: 'grant-user',
  roleCode: 'grant-role',
  processId: 'grant-process',
};

function hasRole(roles: readonly RoleCode[], value: string): value is RoleCode {
  return (roles as readonly string[]).includes(value);
}

/**
 * Asignar rol (design §11.21), diálogo sm. «Usuario, rol y proceso son
 * obligatorios.» es una regla de tres campos: va en FormError y marca solo los
 * que faltan (NIT 6b).
 */
export function CreateGrantDialog({
  open,
  onOpenChange,
  submitting,
  users,
  processes,
  roleLabels,
  assignableRoles,
  errorMessage,
  onSubmit,
}: CreateGrantDialogProps): React.ReactElement {
  const [values, setValues] = React.useState<GrantFormValues>(EMPTY);
  const [missing, setMissing] = React.useState(NO_MISSING);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const ruleError =
    missing.userId || missing.roleCode || missing.processId
      ? 'Usuario, rol y proceso son obligatorios.'
      : null;

  function update(key: FieldKey, value: string): void {
    setValues((v) => ({ ...v, [key]: value }));
    setMissing((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
  }

  /** Props de error de un campo de la regla combinada. */
  function invalidProps(key: FieldKey): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
    return missing[key] ? { 'aria-invalid': true, 'aria-describedby': FORM_ERROR_ID } : {};
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const next = { userId: !values.userId, roleCode: !values.roleCode, processId: !values.processId };
    setMissing(next);
    if (next.userId || next.roleCode || next.processId || !values.roleCode) {
      // No se limpia: se conserva la selección; el foco va al primer campo que falta.
      const first = FIELD_ORDER.find((key) => next[key]);
      if (first) document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    const ok = await onSubmit({
      userId: values.userId,
      roleCode: values.roleCode,
      processId: values.processId,
    });
    // Reinicio solo tras el éxito; ante un error se conserva la selección.
    if (ok) setValues(EMPTY);
  }

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) return;
    if (!next) {
      setValues(EMPTY);
      setMissing(NO_MISSING);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" onOpenAutoFocus={captureTrigger} onCloseAutoFocus={handleCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Asignar rol</DialogTitle>
          <DialogDescription>Concede un rol a un usuario dentro de un proceso.</DialogDescription>
        </DialogHeader>

        <form
          id={FORM_ID}
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="grant-user" label="Usuario" required>
              {(control) => (
                <Select value={values.userId} onValueChange={(value) => update('userId', value)}>
                  <SelectTrigger {...control} {...invalidProps('userId')}>
                    <SelectValue placeholder="Elige un usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.identifier})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field id="grant-role" label="Rol" required>
              {(control) => (
                <Select
                  value={values.roleCode}
                  onValueChange={(value) => {
                    if (hasRole(assignableRoles, value)) update('roleCode', value);
                  }}
                >
                  <SelectTrigger {...control} {...invalidProps('roleCode')}>
                    <SelectValue placeholder="Elige un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((code) => (
                      <SelectItem key={code} value={code}>
                        {roleLabels[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field id="grant-process" label="Proceso" required>
              {(control) => (
                <Select value={values.processId} onValueChange={(value) => update('processId', value)}>
                  <SelectTrigger {...control} {...invalidProps('processId')}>
                    <SelectValue placeholder="Elige un proceso" />
                  </SelectTrigger>
                  <SelectContent>
                    {processes.map((process) => (
                      <SelectItem key={process.id} value={process.id}>
                        {process.name} ({process.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <FormError id={FORM_ID} message={ruleError ?? errorMessage} />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Asignando…' : 'Asignar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
