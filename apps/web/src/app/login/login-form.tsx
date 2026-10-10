'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActor } from '@/lib/actor-context';
import { ApiError, login as loginRequest } from '@/lib/auth';
/** Ruta de inicio tras autenticar correctamente. */
const HOME_ROUTE = '/inicio';
interface FieldErrors {
  identifier?: string;
  password?: string;
}
/**
 * Formulario de login (modo jwt). HTML semantico (`<form>`, `<label htmlFor>`),
 * navegable por teclado, errores por campo accesibles (`role="alert"`,
 * `aria-describedby`) y estado de envio (boton deshabilitado + spinner).
 */
export function LoginForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useActor();
  const expired = searchParams.get('expired') === '1';
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (identifier.trim().length === 0) {
      errors.identifier = 'Ingresa tu usuario o correo.';
    }
    if (password.length === 0) {
      errors.password = 'Ingresa tu contrasena.';
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
      return;
    }
    setSubmitting(true);
    try {
      const result = await loginRequest({
        identifier: identifier.trim(),
        password,
      });
      login(result.accessToken, result.user);
      router.replace(HOME_ROUTE);
    } catch (err) {
      // 401 -> mensaje generico, sin filtrar si el usuario existe.
      if (err instanceof ApiError && err.status === 401) {
        setFormError('Usuario o contrasena incorrectos.');
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('No fue posible iniciar sesion. Intenta de nuevo.');
      }
      setSubmitting(false);
    }
  }
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Iniciar sesion</CardTitle>
        <CardDescription>
          Accede con tu usuario o correo del portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expired ? (
          <p
            role="status"
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            La sesion expiro, vuelve a iniciar sesion.
          </p>
        ) : null}
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="identifier">Usuario o correo</Label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.identifier ? true : undefined}
              aria-describedby={
                fieldErrors.identifier ? 'identifier-error' : undefined
              }
            />
            {fieldErrors.identifier ? (
              <p
                id="identifier-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {fieldErrors.identifier}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contrasena</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                fieldErrors.password ? 'password-error' : undefined
              }
            />
            {fieldErrors.password ? (
              <p
                id="password-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {fieldErrors.password}
              </p>
            ) : null}
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
