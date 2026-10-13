'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useActor } from '@/lib/actor-context';
import { ApiError, login as loginRequest } from '@/lib/auth';
import { postLoginPath } from '@/lib/safe-redirect';
interface FieldErrors {
  identifier?: string;
  password?: string;
}
/** Id del formulario: el FormError lleva `login-error`. */
const FORM_ID = 'login';
/**
 * Formulario de login (modo jwt, design §11.2). `noValidate` y validación al
 * enviar con todos los errores a la vez, bajo cada campo, con role="alert",
 * aria-describedby y aria-invalid; el foco va al primer campo con error y el
 * error de un campo se limpia al editarlo. Los fallos del backend van en el
 * FormError. Durante el envío los campos se deshabilitan y el botón muestra
 * «Ingresando…».
 */
export function LoginForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, sessionExpired } = useActor();
  // Tambien con sessionExpired: el 401 de una sesion guardada se detecta ya en
  // /login, sin pasar por ?expired=1 (evita el bucle /login -> /inicio -> /login).
  const expired = searchParams.get('expired') === '1' || sessionExpired;
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const identifierRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (identifier.trim().length === 0) {
      errors.identifier = 'Ingresa tu usuario o correo.';
    }
    if (password.length === 0) {
      errors.password = 'Ingresa tu contraseña.';
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
    if (errors.identifier || errors.password) {
      // Foco al primer campo con error, en el orden del formulario.
      (errors.identifier ? identifierRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const result = await loginRequest({
        identifier: identifier.trim(),
        password,
      });
      login(result.accessToken, result.user);
      // Vuelve a la ruta de origen (`next`) si es interna y segura; si no, /inicio.
      router.replace(postLoginPath(searchParams));
    } catch (err) {
      // 401 -> mensaje generico, sin filtrar si el usuario existe.
      if (err instanceof ApiError && err.status === 401) {
        setFormError('Usuario o contraseña incorrectos.');
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('No fue posible iniciar sesión. Inténtalo de nuevo.');
      }
      setSubmitting(false);
    }
  }
  return (
    <Card className="w-full max-w-[400px]">
      <CardHeader className="gap-1.5 p-6 pb-4">
        <CardTitle as="h1" className="text-lg tracking-tight">
          Iniciar sesión
        </CardTitle>
        <CardDescription>Accede con tu usuario o correo del portal.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 pt-0">
        {expired ? (
          <InlineNotice tone="warning" role="status">
            La sesión expiró. Vuelve a iniciar sesión.
          </InlineNotice>
        ) : null}
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <Field
            id="identifier"
            label="Usuario o correo"
            error={fieldErrors.identifier}
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
                if (fieldErrors.identifier) {
                  setFieldErrors((prev) => ({ ...prev, identifier: undefined }));
                }
              }}
              disabled={submitting}
            />
          </Field>
          <Field
            id="password"
            label="Contraseña"
            error={fieldErrors.password}
            errorRole="alert"
          >
            <Input
              ref={passwordRef}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              disabled={submitting}
            />
          </Field>
          <div className="text-meta">
            <Link
              href="/olvide-contrasena"
              className="text-primary underline-offset-4 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <FormError id={FORM_ID} message={formError} />
          <Button type="submit" size="lg" loading={submitting} className="w-full">
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
