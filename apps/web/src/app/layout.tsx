import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RouteGuard } from '@/components/route-guard';
import { ThemeProvider } from '@/components/theme-provider';
import { ActorProvider } from '@/lib/actor-context';
import './globals.css';

// Inter autoalojada por next/font en el build. Si el entorno no puede
// descargarla, se quita este import y --font-sans queda en la pila de sistema
// (globals.css).
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'Portal del área', template: '%s · Portal del área' },
  description: 'Portal interno del área de Analítica.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    // suppressHydrationWarning: next-themes escribe la clase de tema en <html>
    // antes de la hidratación (script anti-flash), lo que difiere del HTML del
    // servidor solo en ese atributo.
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <ActorProvider>
            <TooltipProvider delayDuration={300}>
              <RouteGuard>{children}</RouteGuard>
            </TooltipProvider>
          </ActorProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
