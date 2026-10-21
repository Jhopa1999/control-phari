import { HistorialView } from './historial-view';

export const metadata = { title: 'Historial del activo' };

/**
 * Historial de solicitudes por activo (idea de negocio: varias solicitudes se
 * generan sobre el mismo activo a lo largo del tiempo). `params` es asíncrono
 * en Next 16; se resuelve en el servidor y el id se pasa a la vista cliente.
 */
export default async function HistorialActivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return <HistorialView assetId={id} />;
}
