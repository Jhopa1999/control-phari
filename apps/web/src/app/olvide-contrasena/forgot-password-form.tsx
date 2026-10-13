'use client';
import * as React from 'react';
import Link from 'next/link';
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
import { ApiError, requestPasswordReset } from '@/lib/password-reset';

/** Id del formulario: el FormError lleva `forgot-password-error`. */
const FORM_ID = 'forgot-password';

/**
 * Mensaje generico mostrado SIEMPRE tras un envio aceptado por el servidor, sin
 * revelar si la cuenta existe (coherente con el backend, que responde 204 en
 * ambos casos).
 */
const GENERIC_MESSAGE =
  'Si existe una cuenta asociada, enviaremos un correo con instrucciones para restablecer la contraseña.';

/**
 * Formulario de «¿Olvidaste tu contraseña?» (design §11.2, mismo patron que el
 * login): `noValidate`, validacion al enviar con error bajo el campo
 * (role="alert"), foco al campo con error y limpieza al editar. En exito se
 * oculta el formulario y se muestra el aviso generico; un fallo tecnico (red o
 * 5xx) va al FormError sin revelar existencia.
 */
export function ForgotPasswordForm(): React.ReactElement {
  const [identifier, setIdentifier] = React.useState('');
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const identifierRef = React.useRef<HTMLInputElement>(null);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFormError(null);
    if (identifier.trim().length === 0) {
      setFieldError('Ingresa tu usuario o correo.');
      identifierRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset({ identifier: identifier.trim() });
      setSent(true);
    } catch (err) {
      // No se revela si la cuenta existe: solo se informa de un fallo tecnico.
      if (err instanceof ApiError) {
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
          Recuperar contraseña
        </CardTitle>
        <CardDescription>
          Ingresa tu usuario o correo y te enviaremos las instrucciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 pt-0">
        {sent ? (
          <>
            <InlineNotice tone="success" role="status">
              {GENERIC_MESSAGE}
            </InlineNotice>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/login">Volver a iniciar sesión</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="grid gap-4">
            <Field
              id="identifier"
              label="Usuario o correo"
              error={fieldError}
              errorRole="alert"
            >
              <Input
                ref={identifierRef}
                name="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (fieldError) setFieldError(undefined);
                }}
                disabled={submitting}
              />
            </Field>
            <FormError id={FORM_ID} message={formError} />
            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {submitting ? 'Enviando…' : 'Enviar instrucciones'}
            </Button>
            <p className="text-center text-meta text-muted-foreground">
              <Link href="/login" className="underline underline-offset-4">
                Volver a iniciar sesión
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
