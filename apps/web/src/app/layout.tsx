import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RouteGuard } from '@/components/route-guard';
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
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ActorProvider>
          <TooltipProvider delayDuration={300}>
            <RouteGuard>{children}</RouteGuard>
          </TooltipProvider>
        </ActorProvider>
        <Toaster />
      </body>
    </html>
  );
}
