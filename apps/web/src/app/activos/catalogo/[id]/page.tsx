import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { FichaActivoView } from './ficha-activo-view';

export const metadata = { title: 'Ficha del activo' };

/**
 * Ficha del activo. `params` es asíncrono en Next 16; se resuelve en el
 * servidor y el id se pasa a la vista cliente. La vista lee ?tab=
 * (useSearchParams): el fallback ya trae el h1.
 */
export default async function FichaActivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return (
    <Suspense
      fallback={<PageFallback title="Activo" description="Ficha del activo." variant="detail" />}
    >
      <FichaActivoView assetId={id} />
    </Suspense>
  );
}
