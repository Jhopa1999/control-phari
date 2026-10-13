'use client';
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Field, FormError } from '@/components/field';
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
import { ApiError, setPasswordWithToken } from '@/lib/password-reset';

/**
 * Longitud minima de contrasena validada en el cliente. Coincide con el minimo
 * fijo del contrato (ResetPasswordDto: newPassword >= 8). El backend sigue
 * siendo la autoridad: re-valida y responde 400 si no cumple.
 */
const MIN_PASSWORD_LENGTH = 8;

/** Id del formulario: el FormError lleva `set-password-error`. */
const FORM_ID = 'set-password';

interface FieldErrors {
  newPassword?: string;
  confirmPassword?: string;
}

export interface SetPasswordCopy {
  /** Titulo de la tarjeta (h1). */
  title: string;
  /** Descripcion bajo el titulo. */
  description: string;
  /** Texto del boton de envio en reposo. */
  submitLabel: string;
  /** Texto del boton durante el envio. */
  submittingLabel: string;
  /** Titulo del aviso de exito. */
  successTitle: string;
  /** Cuerpo del aviso de exito. */
  successMessage: string;
}

/**
 * Formulario compartido para «restablecer contraseña» y «activar cuenta»: ambos
 * leen `?token=` y hacen POST /auth/reset-password (el backend acepta tokens de
 * reset y de activacion). Solo cambian los textos, parametrizados por `copy`.
 *
 * Patron accesible del login (design §11.2): `noValidate`, validacion al enviar
 * con todos los errores a la vez bajo cada campo (role="alert"), foco al primer
 * campo con error y limpieza al editar. Los fallos del backend van al FormError
 * traducidos (400: token invalido o contrasena corta; 410: token caducado o ya
 * usado), sin exponer JSON crudo.
 */
export function SetPasswordForm({ copy }: { copy: SetPasswordCopy }): React.ReactElement {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const newPasswordRef = React.useRef<HTMLInputElement>(null);
  const confirmPasswordRef = React.useRef<HTMLInputElement>(null);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      errors.newPassword = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (confirmPassword !== newPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden.';
    }
    return errors;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFormError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (errors.newPassword || errors.confirmPassword) {
      (errors.newPassword ? newPasswordRef : confirmPasswordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await setPasswordWithToken({ token, newPassword });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setFormError('El enlace ha caducado o ya fue utilizado. Solicita uno nuevo.');
      } else if (err instanceof ApiError && err.status === 400) {
        setFormError('El enlace no es válido o la contraseña no cumple los requisitos.');
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('No fue posible procesar la solicitud. Inténtalo de nuevo.');
      }
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px]">
      <CardHeader className="gap-1.5 p-6 pb-4">
        <CardTitle as="h1" className="text-lg tracking-tight">
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 pt-0">
        {done ? (
          <>
            <InlineNotice tone="success" role="status" title={copy.successTitle}>
              {copy.successMessage}
            </InlineNotice>
            <Button asChild size="lg" className="w-full">
              <Link href="/login">Ir a iniciar sesión</Link>
            </Button>
          </>
        ) : token.length === 0 ? (
          <>
            <InlineNotice tone="danger" role="alert">
              El enlace no es válido. Falta el token de seguridad. Solicita un
              nuevo enlace.
            </InlineNotice>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/olvide-contrasena">Solicitar un nuevo enlace</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="grid gap-4">
            <Field
              id="newPassword"
              label="Nueva contraseña"
              error={fieldErrors.newPassword}
              errorRole="alert"
              help={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
            >
              <Input
                ref={newPasswordRef}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (fieldErrors.newPassword) {
                    setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
                  }
                }}
                disabled={submitting}
              />
            </Field>
            <Field
              id="confirmPassword"
              label="Confirmar contraseña"
              error={fieldErrors.confirmPassword}
              errorRole="alert"
            >
              <Input
                ref={confirmPasswordRef}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }
                }}
                disabled={submitting}
              />
            </Field>
            <FormError id={FORM_ID} message={formError} />
            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {submitting ? copy.submittingLabel : copy.submitLabel}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
