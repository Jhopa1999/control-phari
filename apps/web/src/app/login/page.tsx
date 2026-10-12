import * as React from 'react';
import type { Metadata } from 'next';
import { BrandMark, BrandName } from '@/components/brand';
import { LoginForm } from './login-form';
export const metadata: Metadata = {
  title: 'Iniciar sesión',
};
/**
 * Pantalla de login (design §11.2). El landmark principal lo aporta quien la
 * contiene, para que nunca haya dos `main`: en jwt, RouteGuard la pinta sin
 * shell dentro de `main#contenido`; en dev-header sigue dentro del shell. El
 * formulario es un componente cliente y `useSearchParams` exige el Suspense.
 */
export default function LoginPage(): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
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
