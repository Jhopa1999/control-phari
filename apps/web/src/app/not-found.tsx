import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Página no encontrada',
};

/**
 * Ruta inexistente (design §8.6). El not-found raíz atiende cualquier URL sin
 * ruta y conserva el estado 404; se pinta dentro del shell, porque RouteGuard
 * vive en el layout (en jwt sin sesión, redirige a /login como cualquier ruta
 * protegida). Componente de servidor.
 */
export default function NotFound(): React.ReactElement {
  return (
    <PageLayout>
      <PageHeader title="Página no encontrada" />
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={Compass}
          title="Esta dirección no existe o cambió."
          description="Revisa el enlace o vuelve al inicio del portal."
          action={
            <Link href="/inicio" className={buttonVariants({ variant: 'outline' })}>
              Ir al Panel del área
            </Link>
          }
        />
      </div>
    </PageLayout>
  );
}
