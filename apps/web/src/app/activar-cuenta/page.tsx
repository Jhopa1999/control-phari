import * as React from 'react';
import type { Metadata } from 'next';
import { BrandName } from '@/components/brand';
import { SetPasswordForm } from '@/components/set-password-form';
import { getAuthMode } from '@/lib/auth-mode';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Activar cuenta',
};

/**
 * Pantalla de activación de cuenta (publica). Lee `?token=` del enlace de
 * invitación y reutiliza el formulario compartido con copy de activación: usa
 * el mismo POST /auth/reset-password (el backend acepta tokens de invitación).
 * El Suspense es obligatorio porque el formulario usa `useSearchParams`.
 */
export default function ActivateAccountPage(): React.ReactElement {
  const insideShell = getAuthMode() !== 'jwt';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6 py-10',
        insideShell ? 'min-h-full' : 'min-h-dvh bg-muted px-4',
      )}
    >
      <BrandName size="lg" className="items-center" />
      <React.Suspense fallback={null}>
        <SetPasswordForm
          copy={{
            title: 'Activar cuenta',
            description: 'Establece tu contraseña para activar tu cuenta.',
            submitLabel: 'Activar cuenta',
            submittingLabel: 'Activando…',
            redirectingMessage: 'Cuenta activada, entrando…',
          }}
        />
      </React.Suspense>
    </div>
  );
}
