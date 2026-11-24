import { redirect } from 'next/navigation';

export const metadata = { title: 'Historial del activo' };

/**
 * El historial de solicitudes ahora es la pestaña «Solicitudes» de la ficha del
 * activo. La ruta antigua se conserva para los enlaces ya guardados.
 */
export default async function HistorialActivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  redirect(`/activos/catalogo/${encodeURIComponent(id)}?tab=solicitudes`);
}
