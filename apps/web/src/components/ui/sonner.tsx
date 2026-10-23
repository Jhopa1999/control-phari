'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Variables de sonner mapeadas a los tokens del sistema (globals.css).
const toasterStyle = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--success-bg': 'var(--success-subtle)',
  '--success-text': 'var(--success)',
  '--success-border': 'var(--success-border)',
  '--error-bg': 'var(--danger-subtle)',
  '--error-text': 'var(--danger)',
  '--error-border': 'var(--danger-border)',
  '--warning-bg': 'var(--warning-subtle)',
  '--warning-text': 'var(--warning)',
  '--warning-border': 'var(--warning-border)',
  '--info-bg': 'var(--info-subtle)',
  '--info-text': 'var(--info)',
  '--info-border': 'var(--info-border)',
} as React.CSSProperties;

/**
 * Toaster de notificaciones (sonner) con etiquetas en español. El tema sigue al
 * tema activo (next-themes): `useTheme().theme` devuelve 'light' | 'dark' |
 * 'system', valores que acepta `ToasterProps['theme']`; con 'system' sonner
 * resuelve por `prefers-color-scheme`.
 */
function Toaster(props: ToasterProps) {
  const { theme = 'system' } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-right"
      richColors
      closeButton
      containerAriaLabel="Notificaciones"
      toastOptions={{ closeButtonAriaLabel: 'Cerrar notificación' }}
      style={toasterStyle}
      {...props}
    />
  );
}

export { Toaster };
