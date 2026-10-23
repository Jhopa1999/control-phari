'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Proveedor de tema del portal (Fase D). Envuelve `next-themes` con las props
 * fijas del proyecto; no se exponen para no desviarse de la decisión del plan:
 *
 * - `attribute="class"`: aplica/retira la clase `.dark` en `<html>`, que es la
 *   estrategia que ya usa globals.css (`@custom-variant dark (&:is(.dark *))`).
 * - `defaultTheme="system"` + `enableSystem`: sigue `prefers-color-scheme`
 *   cuando la preferencia es «Sistema».
 * - `disableTransitionOnChange`: evita el barrido de transiciones al alternar.
 *
 * `next-themes` persiste la preferencia en localStorage (clave `theme`) y
 * resuelve el *flash of wrong theme* con un script inline en `<head>`; por eso
 * el `<html>` del layout lleva `suppressHydrationWarning`. No se añade
 * persistencia propia.
 */
export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
