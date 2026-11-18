import * as React from 'react';
import type { Metadata } from 'next';
import { BrandName } from '@/components/brand';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = {
  title: 'Cambiar contraseña',
};

/**
 * Cambio de contraseña obligatorio. Con el indicador activo es la única pantalla
 * que funciona: el RouteGuard la pinta sin menú (`<main id="contenido">`) y
 * redirige aquí desde cualquier otra ruta. El Suspense es obligatorio porque el
 * formulario usa `useSearchParams`.
 */
export default function ChangePasswordPage(): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
      <BrandName size="lg" className="items-center" />
      <React.Suspense fallback={null}>
        <ChangePasswordForm />
      </React.Suspense>
    </div>
  );
}
