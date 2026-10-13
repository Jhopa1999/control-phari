import * as React from 'react';
import type { Metadata } from 'next';
import { BrandMark, BrandName } from '@/components/brand';
import { getAuthMode } from '@/lib/auth-mode';
import { cn } from '@/lib/utils';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
};

/**
 * Pantalla «¿Olvidaste tu contraseña?» (publica). Reutiliza el encuadre del
 * login: dentro del shell (dev-header) no fuerza alto de viewport ni fondo
 * gris; fuera del shell (jwt) se centra en pantalla completa.
 */
export default function ForgotPasswordPage(): React.ReactElement {
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
      <ForgotPasswordForm />
    </div>
  );
}
