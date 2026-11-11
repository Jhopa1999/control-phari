import { FichaView } from '@/app/demanda/solicitudes/[id]/ficha-view';

export const metadata = { title: 'Detalle de la iniciativa' };

/**
 * Ficha de una solicitud abierta desde el Portafolio: misma ficha de solo
 * lectura que /demanda/solicitudes/:id, pero bajo la ruta del Portafolio para
 * que el menú lateral y la miga («Portafolio › título») conserven el contexto.
 * El enlace directo a /demanda/solicitudes/:id sigue funcionando igual.
 */
export default async function PortafolioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return <FichaView id={id} from="portafolio" />;
}