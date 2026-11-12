import { redirect } from 'next/navigation';

/**
 * El módulo Novedades se retiró: la ruta antigua (marcadores y enlaces viejos)
 * lleva a la Bitácora. Los datos se conservan en la base, sin pantalla ni API.
 */
export default function NovedadesPage(): never {
  redirect('/seguimiento/bitacora');
}