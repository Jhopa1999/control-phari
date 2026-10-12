import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// `text-meta` es un tamaño de texto propio (13/18 px, globals.css). Sin
// registrarlo, tailwind-merge lo toma por un color y descarta el color de texto
// que lo acompaña (p. ej. en el botón pequeño o en las etiquetas).
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ['meta'] },
  },
});

/**
 * Combina clases de Tailwind resolviendo conflictos (helper estandar de shadcn).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
