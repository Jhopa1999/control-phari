'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Field, FormError, RequiredHint } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useActor } from '@/lib/actor-context';
import { resolvePostLoginHref } from '@/lib/post-login';
import { ChangePasswordError, changePassword } from '@/lib/password';

/**
 * Longitud mínima validada en el cliente: el piso del contrato (8). El servidor
 * sigue siendo la autoridad y puede exigir más con PASSWORD_MIN_LENGTH.
 */
const MIN_PASSWORD_LENGTH = 8;
const FORM_ID = 'change-password';

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/** Errores locales al enviar, en el orden de la especificación (todos a la vez). */
function validate(current: string, next: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (current.length === 0) errors.currentPassword = 'Escribe tu contraseña actual.';
  if (next.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  } else if (current.length > 0 && next === current) {
    errors.newPassword = 'La contraseña nueva debe ser distinta de la actual.';
  }
  if (confirm !== next) errors.confirmPassword = 'Las contraseñas no coinciden.';
  return errors;
}

/**
 * Formulario de cambio de contraseña obligatorio. Patrón accesible del login:
 * `noValidate`, validación al enviar con todos los errores a la vez
 * (role="alert"), foco al primer campo con error y limpieza al editar. El
 * servidor decide: 400 marca el campo cuando el texto es el conocido y si no va
 * al aviso del formulario; 429 informa la espera.
 */
export function ChangePasswordForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logout, reload, permissions } = useActor();
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // En el camino feliz no se vuelve a habilitar: el formulario está navegando.
  const [done, setDone] = React.useState(false);
  const currentRef = React.useRef<HTMLInputElement>(null);
  const newRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    currentRef.current?.focus();
  }, []);

  function clearError(field: keyof FieldErrors): void {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    const errors = validate(currentPassword, newPassword, confirmPassword);
    setFieldErrors(errors);
    if (errors.currentPassword || errors.newPassword || errors.confirmPassword) {
      const first = errors.currentPassword
        ? currentRef
        : errors.newPassword
          ? newRef
          : confirmRef;
      first.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setDone(true);
      // Recarga los permisos (el indicador ya está limpio) y entra al portal.
      reload();
      router.replace(await resolvePostLoginHref(searchParams));
    } catch (err) {
      const failure =
        err instanceof ChangePasswordError
          ? err.failure
          : { message: 'No fue posible cambiar la contraseña. Inténtalo de nuevo.' };
      if ('field' in failure && failure.field === 'currentPassword') {
        setFieldErrors({ currentPassword: failure.message });
        currentRef.current?.focus();
        currentRef.current?.select();
      } else if ('field' in failure && failure.field === 'newPassword') {
        setFieldErrors({ newPassword: failure.message });
        newRef.current?.focus();
      } else {
        setFormError(failure.message);
        if (err instanceof ChangePasswordError && err.status === 400) newRef.current?.focus();
      }
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px]">
      <CardHeader className="gap-1.5 p-6 pb-4">
        <CardTitle as="h1" className="text-lg tracking-tight">
          Cambia tu contraseña
        </CardTitle>
        <CardDescription>
          Por seguridad, debes elegir una contraseña nueva antes de seguir usando el portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 pt-0">
        {done ? (
          <InlineNotice tone="success" role="status">
            Contraseña actualizada. Entrando al portal…
          </InlineNotice>
        ) : (
          <>
            <form onSubmit={handleSubmit} noValidate className="grid gap-4">
              <RequiredHint />
              {/* Ayuda a los gestores de contraseñas a asociar la cuenta; no se ve. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={permissions?.identifier ?? ''}
                readOnly
                hidden
              />
              <Field
                id="currentPassword"
                label="Contraseña actual"
                required
                error={fieldErrors.currentPassword}
                errorRole="alert"
              >
                <Input
                  ref={currentRef}
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    clearError('currentPassword');
                  }}
                  disabled={submitting}
                />
              </Field>
              <Field
                id="newPassword"
                label="Nueva contraseña"
                required
                error={fieldErrors.newPassword}
                errorRole="alert"
                help={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres y distinta de la actual.`}
              >
                <Input
                  ref={newRef}
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    clearError('newPassword');
                  }}
                  disabled={submitting}
                />
              </Field>
              <Field
                id="confirmPassword"
                label="Confirmar contraseña nueva"
                required
                error={fieldErrors.confirmPassword}
                errorRole="alert"
              >
                <Input
                  ref={confirmRef}
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearError('confirmPassword');
                  }}
                  disabled={submitting}
                />
              </Field>
              <FormError id={FORM_ID} message={formError} />
              <Button type="submit" size="lg" loading={submitting} className="w-full">
                {submitting ? 'Guardando…' : 'Cambiar contraseña'}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              disabled={submitting}
              onClick={() => void logout()}
            >
              Cerrar sesión
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
