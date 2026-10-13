import * as React from 'react';
import type { Metadata } from 'next';
import { BrandMark, BrandName } from '@/components/brand';
import { SetPasswordForm } from '@/components/set-password-form';
import { getAuthMode } from '@/lib/auth-mode';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Restablecer contraseña',
};

/**
 * Pantalla de restablecimiento de contraseña (publica). Lee `?token=` del
 * enlace enviado por correo y reutiliza el formulario compartido. El Suspense
 * es obligatorio porque el formulario usa `useSearchParams`.
 */
export default function ResetPasswordPage(): React.ReactElement {
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
        <SetPasswordForm
          copy={{
            title: 'Restablecer contraseña',
            description: 'Define una nueva contraseña para tu cuenta.',
            submitLabel: 'Guardar contraseña',
            submittingLabel: 'Guardando…',
            successTitle: 'Contraseña actualizada',
            successMessage:
              'Tu contraseña se actualizó. Ya puedes iniciar sesión con la nueva.',
          }}
        />
      </React.Suspense>
    </div>
  );
}
