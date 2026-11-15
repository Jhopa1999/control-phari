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
import { resolvePostLoginHref } from '@/lib/post-login';
import { countdownLabel, waitLabel } from '@/lib/wait-label';
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
  // Bloqueo por demasiados intentos (429): texto de espera fijo y, si la API
  // informó Retry-After, instante en que termina para la cuenta regresiva.
  const [lock, setLock] = React.useState<{ text: string; until: number | null } | null>(null);
  const [remaining, setRemaining] = React.useState(0);
  const [unlockedNotice, setUnlockedNotice] = React.useState(false);
  const identifierRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const lockUntil = lock?.until ?? null;
  React.useEffect(() => {
    if (lockUntil === null) return;
    const tick = (): void => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left <= 0) {
        setRemaining(0);
        setLock(null);
        setUnlockedNotice(true);
      } else {
        setRemaining(left);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockUntil]);

  const countingDown = lock !== null && lock.until !== null && remaining > 0;

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
    if (countingDown) return;
    setFormError(null);
    setLock(null);
    setUnlockedNotice(false);
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
      // La API ya dejó la sesión en la cookie HttpOnly; el accessToken del cuerpo se descarta.
      login(result.user);
      // Vuelve a la ruta de origen (`next`) si es interna y segura; si no, /inicio.
      // Con `next` válido va ahí; si no, a la pantalla de inicio que corresponde al rol.
      router.replace(await resolvePostLoginHref(searchParams));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Un solo aviso a la vez: el 429 sustituye al de credenciales.
        setFormError(null);
        setLock({
          text: waitLabel(err.retryAfterSeconds),
          until:
            err.retryAfterSeconds !== undefined
              ? Date.now() + err.retryAfterSeconds * 1000
              : null,
        });
      } else if (err instanceof ApiError && err.status === 401) {
        // 401 -> mensaje generico, sin filtrar si el usuario existe.
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
              className="text-link underline-offset-4 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <FormError id={FORM_ID} message={formError} />
          {lock ? (
            <InlineNotice
              tone="warning"
              role="alert"
              id={`${FORM_ID}-error`}
              title="Demasiados intentos fallidos."
            >
              <p>
                Por seguridad, el acceso está bloqueado un momento. Inténtalo de nuevo en{' '}
                {lock.text}.
              </p>
              <p className="mt-1">
                ¿No recuerdas tu contraseña?{' '}
                <Link
                  href="/olvide-contrasena"
                  className="text-link underline underline-offset-4 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                >
                  Recupérala aquí
                </Link>
              </p>
            </InlineNotice>
          ) : null}
          <p role="status" className="sr-only">
            {unlockedNotice ? 'Ya puedes intentar iniciar sesión de nuevo.' : ''}
          </p>
          <Button
            type="submit"
            size="lg"
            loading={submitting}
            disabled={countingDown}
            className="w-full"
          >
            {submitting ? (
              'Ingresando…'
            ) : countingDown ? (
              <>
                Reintenta en <span className="tabular-nums">{countdownLabel(remaining)}</span>
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
