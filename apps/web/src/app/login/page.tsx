import * as React from 'react';
import type { Metadata } from 'next';
import { BrandMark, BrandName } from '@/components/brand';
import { getAuthMode } from '@/lib/auth-mode';
import { cn } from '@/lib/utils';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
};

/**
 * Pantalla de login (design §11.2). El landmark principal lo aporta quien la
 * contiene, para que nunca haya dos `main`: en jwt, RouteGuard la pinta sin
 * shell dentro de `main#contenido`; en dev-header sigue dentro del shell. El
 * formulario es un componente cliente y `useSearchParams` exige el Suspense.
 *
 * Dentro del shell (dev-header) no se usa la altura de viewport ni el fondo
 * gris: el `main` ya tiene su padding y la página sobrepasaría la pantalla.
 */
export default function LoginPage(): React.ReactElement {
  const insideShell = getAuthMode() !== 'jwt';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6 py-10',
        insideShell ? 'min-h-full' : 'min-h-dvh bg-muted px-4',
      )}
    >
      <div className="flex items-center gap-2.5">
        <BrandMark />
        <BrandName />
      </div>
      <React.Suspense fallback={null}>
        <LoginForm />
      </React.Suspense>
    </div>
  );
}
