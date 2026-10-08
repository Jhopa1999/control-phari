import { redirect } from 'next/navigation';

/**
 * No hay dashboard todavia: la raiz redirige a la unica pantalla real.
 */
export default function HomePage(): never {
  redirect('/catalogs');
}
