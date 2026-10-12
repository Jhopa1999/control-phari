import * as React from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';
export const metadata: Metadata = {
  title: 'Iniciar sesión',
};
/**
 * Pantalla de login (App Router). El formulario es un componente cliente;
 * aqui solo se compone el layout centrado y el limite de Suspense que requiere
 * `useSearchParams` en Next.
 */
export default function LoginPage(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <React.Suspense fallback={null}>
        <LoginForm />
      </React.Suspense>
    </div>
  );
}
