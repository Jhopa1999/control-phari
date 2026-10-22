import { FichaView } from './ficha-view';

export const metadata = { title: 'Detalle de la solicitud' };

/**
 * Ficha de detalle de una solicitud (SOLO LECTURA): el recorrido completo del
 * ciclo de vida en un stepper. `params` es asíncrono en Next 16; se resuelve en
 * el servidor y el id se pasa a la vista cliente.
 */
export default async function SolicitudDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return <FichaView id={id} />;
}
