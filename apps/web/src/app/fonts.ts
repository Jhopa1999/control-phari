import localFont from 'next/font/local';

/*
 * Tipografías de la marca GIBO (steering 25-marca-gibo.md), autoalojadas desde
 * ./fonts (archivos del paquete de marca; licencias OFL junto a cada una). Sin
 * descarga externa en el build. Inter: texto e interfaz. Montserrat: titulares
 * (h1–h3 vía --font-heading en globals.css). Las usan layout.tsx y
 * global-error.tsx.
 */
export const inter = localFont({
  src: './fonts/Inter-variable.ttf',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});

export const montserrat = localFont({
  src: './fonts/Montserrat-variable.ttf',
  weight: '100 900',
  display: 'swap',
  variable: '--font-montserrat',
});
