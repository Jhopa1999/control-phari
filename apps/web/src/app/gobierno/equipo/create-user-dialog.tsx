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

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  /** Error del backend (p. ej. identificador duplicado); el padre lo limpia al abrir. */
  errorMessage: string | null;
  /** Devuelve true si la creación fue exitosa (el formulario se limpia). */
  onSubmit: (input: { identifier: string; name: string }) => Promise<boolean>;
}

const FORM_ID = 'user-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;
const EMPTY = { identifier: '', name: '' };
const NO_MISSING = { identifier: false, name: false };

/**
 * Nuevo usuario (design §11.21), diálogo sm. «Identificador y nombre son
 * obligatorios.» es una regla de dos campos: va en FormError y marca solo los
 * campos vacíos (NIT 6b).
 */
export function CreateUserDialog({
  open,
  onOpenChange,
  submitting,
  errorMessage,
  onSubmit,
}: CreateUserDialogProps): React.ReactElement {
  const [values, setValues] = React.useState(EMPTY);
  const [missing, setMissing] = React.useState(NO_MISSING);
  const identifierRef = React.useRef<HTMLInputElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const ruleError =
    missing.identifier || missing.name ? 'Identificador y nombre son obligatorios.' : null;

  function update(key: 'identifier' | 'name', value: string): void {
    setValues((v) => ({ ...v, [key]: value }));
    // El campo deja de marcarse al editarlo; la regla, cuando ninguno queda marcado.
    setMissing((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const identifier = values.identifier.trim();
    const name = values.name.trim();
    const next = { identifier: !identifier, name: !name };
    setMissing(next);
    if (next.identifier || next.name) {
      // No se limpia: se conserva lo escrito y el foco vuelve al identificador.
      identifierRef.current?.focus();
      return;
    }
    const ok = await onSubmit({ identifier, name });
    if (ok) {
      // Reinicio solo tras el éxito.
      setValues(EMPTY);
    } else {
      // Ante un error se conservan los valores y el foco vuelve al identificador.
      identifierRef.current?.focus();
    }
  }

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) return;
    // Al cerrar se limpia; al reabrir parte de cero.
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
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Registra una identidad funcional del área.</DialogDescription>
        </DialogHeader>

        <form
          id={FORM_ID}
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="user-identifier" label="Identificador" required>
              <Input
                ref={identifierRef}
                value={values.identifier}
                placeholder="persona@demo.local"
                autoComplete="off"
                aria-invalid={missing.identifier ? true : undefined}
                aria-describedby={missing.identifier ? FORM_ERROR_ID : undefined}
                onChange={(e) => update('identifier', e.target.value)}
              />
            </Field>
            <Field id="user-name" label="Nombre" required>
              <Input
                value={values.name}
                placeholder="Persona Demo"
                aria-invalid={missing.name ? true : undefined}
                aria-describedby={missing.name ? FORM_ERROR_ID : undefined}
                onChange={(e) => update('name', e.target.value)}
              />
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
              {submitting ? 'Creando…' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
