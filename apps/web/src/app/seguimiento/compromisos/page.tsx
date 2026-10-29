import { redirect } from 'next/navigation';

/**
 * Compromisos se unificó con Reuniones: la ruta antigua lleva a la pestaña
 * «Compromisos» del módulo «Reuniones y compromisos».
 */
export default function CompromisosPage(): never {
  redirect('/seguimiento/reuniones?tab=compromisos');
}
