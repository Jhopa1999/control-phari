'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Toaster de notificaciones. Integracion ligera de sonner.
 * El tema se mantiene en "system" para respetar el esquema claro/oscuro.
 */
function Toaster(props: ToasterProps) {
  return <Sonner theme="system" richColors closeButton {...props} />;
}

export { Toaster };
