import { redirect } from 'next/navigation';

/**
 * La raiz redirige a la pantalla de inicio del portal.
 */
export default function HomePage(): never {
  redirect('/inicio');
}
