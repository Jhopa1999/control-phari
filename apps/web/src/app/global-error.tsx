'use client';

import * as React from 'react';
import { Inter } from 'next/font/google';
import { RefreshCw } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import './globals.css';

// Misma fuente que el layout raíz (§5.2): este archivo lo sustituye, así que
// sin la variable --font-inter la pantalla saldría en la pila de sistema.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

interface GlobalErrorProps {
  error: Error & { digest?: string };
  /** Vuelve a pedir y a pintar la aplicación. */
  retry: () => void;
}

/**
 * Error del propio layout raíz (design §8.6): sustituye al layout, así que
 * define su `<html lang="es">` y su `<body>`, importa los estilos globales y
 * usa `<title>`, porque este archivo no admite `metadata`. No muestra
 * `error.message` ni lo registra (§16).
 */
export default function GlobalError({ retry }: GlobalErrorProps): React.ReactElement {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-dvh bg-muted text-foreground antialiased">
        <title>Error · Portal del área</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10 text-center">
          <BrandMark />
          <h1 className="text-xl font-semibold tracking-tight">No fue posible cargar el portal.</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Recarga la página. Si el problema continúa, contacta al administrador del portal.
          </p>
          <Button type="button" variant="outline" onClick={() => retry()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </main>
      </body>
    </html>
  );
}
