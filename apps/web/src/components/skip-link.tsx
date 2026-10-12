import * as React from 'react';

/**
 * «Saltar al contenido» (design §7.8 y §14): primer elemento enfocable del
 * shell. Solo se ve al recibir el foco y lleva a `main#contenido`, que tiene
 * tabIndex -1 para que el navegador le pase el foco. Seguro para servidor.
 */
export function SkipLink(): React.ReactElement {
  return (
    <a
      href="#contenido"
      className="sr-only rounded-md bg-background text-sm font-medium shadow-md outline-2 outline-ring focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:px-3 focus:py-2"
    >
      Saltar al contenido
    </a>
  );
}
